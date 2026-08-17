;; CV Tools -- AutoLISP helpers for normalising a colony DWG before DXF export.
;; Phase 1: CV-LAYERS, CV-MERGE, CV-HIDETEXT/CV-SHOWTEXT, CV-CLOSE, CV-NEXT.
;;
;; Scope and safety:
;;   - Nothing here writes to COL-SITE/COL-PLOT/COL-PLOT-NO/etc. directly.
;;     Working output lands on scratch layers (CV-MERGED, CV-PLOT-DRAFT,
;;     CV-FLAGS) for a human to review before moving it onto the real
;;     COL-* layers. The contract (docs/cad-layer-standard.md) still governs
;;     what actually gets ingested -- this tool only removes drudgery
;;     upstream of it.
;;   - Always run against a working copy of the DWG, never the original.
;;   - Each command wraps its edits in one UNDO group, so a single "U"
;;     reverses the whole operation.
;;   - Every command appends one line to <drawing>-cv-log.txt next to the
;;     DWG, so there's a paper trail of what an automated pass did.
;;
;; Load: see tools/cad-lisp/README.md for the one-time setup that makes
;; these commands available automatically every time you open AutoCAD.

(vl-load-com)

;; ---------------------------------------------------------------------
;; helpers
;; ---------------------------------------------------------------------

(defun cv:undo-begin () (command "_.undo" "_begin"))
(defun cv:undo-end () (command "_.undo" "_end"))

(defun cv:log (msg / fname f)
  (setq fname (strcat (getvar "DWGPREFIX")
                       (vl-filename-base (getvar "DWGNAME"))
                       "-cv-log.txt"))
  (setq f (open fname "a"))
  (if f
    (progn
      (write-line
        (strcat (menucmd "M=$(edtime,$(getvar,date),YYYY-MO-DD HH:MM:SS)") "  " msg)
        f)
      (close f))
    (princ "\nCV: warning -- could not write log file.")
  )
)

(defun cv:ensure-layer (name color / )
  (if (not (tblsearch "LAYER" name))
    (entmake (list '(0 . "LAYER")
                    '(100 . "AcDbSymbolTableRecord")
                    '(100 . "AcDbLayerTableRecord")
                    (cons 2 name)
                    '(70 . 0)
                    (cons 62 color)
                    '(6 . "Continuous")))
  )
)

(defun cv:chlayer (ss layername / i ent e)
  (setq i 0)
  (while (< i (sslength ss))
    (setq ent (ssname ss i))
    (setq e (entget ent))
    (entmod (subst (cons 8 layername) (assoc 8 e) e))
    (setq i (1+ i))
  )
)

(defun cv:set-invisible (ent val / e)
  (setq e (entget ent))
  (if (assoc 60 e)
    (setq e (subst (cons 60 val) (assoc 60 e) e))
    (setq e (append e (list (cons 60 val))))
  )
  (entmod e)
)

(defun cv:pt3 (p) (list (car p) (cadr p) (if (caddr p) (caddr p) 0.0)))

;; Bounding box of a selection set, from LINE endpoints and LWPOLYLINE
;; vertices (10/11 group codes). Good enough for the entity types
;; CV-MERGE deals with.
(defun cv:extents (ss / i ent edata minx miny maxx maxy pt)
  (setq minx 1e99 miny 1e99 maxx -1e99 maxy -1e99)
  (setq i 0)
  (while (< i (sslength ss))
    (setq ent (ssname ss i) edata (entget ent))
    (foreach pair edata
      (if (member (car pair) '(10 11))
        (progn
          (setq pt (cdr pair))
          (if (< (car pt) minx) (setq minx (car pt)))
          (if (> (car pt) maxx) (setq maxx (car pt)))
          (if (< (cadr pt) miny) (setq miny (cadr pt)))
          (if (> (cadr pt) maxy) (setq maxy (cadr pt)))
        )
      )
    )
    (setq i (1+ i))
  )
  (list minx miny maxx maxy)
)

(defun cv:sweep-points (bbox spacing / minx miny maxx maxy x y pts)
  (setq minx (nth 0 bbox) miny (nth 1 bbox) maxx (nth 2 bbox) maxy (nth 3 bbox))
  (setq pts '())
  (setq y (+ miny (/ spacing 2.0)))
  (while (< y maxy)
    (setq x (+ minx (/ spacing 2.0)))
    (while (< x maxx)
      (setq pts (cons (list x y 0.0) pts))
      (setq x (+ x spacing))
    )
    (setq y (+ y spacing))
  )
  pts
)

;; Loose (unshared) endpoints of open LINE/LWPOLYLINE entities in ss.
;; Returns a list of (point entity) pairs.
(defun cv:collect-endpoints (ss / i ent edata etype pts vlist p1 p2 closed)
  (setq pts '())
  (setq i 0)
  (while (< i (sslength ss))
    (setq ent (ssname ss i) edata (entget ent) etype (cdr (assoc 0 edata)))
    (cond
      ((= etype "LINE")
        (setq p1 (cv:pt3 (cdr (assoc 10 edata))) p2 (cv:pt3 (cdr (assoc 11 edata))))
        (setq pts (cons (list p1 ent) pts))
        (setq pts (cons (list p2 ent) pts))
      )
      ((= etype "LWPOLYLINE")
        (setq closed (= 1 (logand 1 (cdr (assoc 70 edata)))))
        (if (not closed)
          (progn
            (setq vlist (mapcar 'cdr (vl-remove-if-not '(lambda (x) (= (car x) 10)) edata)))
            (setq p1 (cv:pt3 (car vlist)) p2 (cv:pt3 (last vlist)))
            (setq pts (cons (list p1 ent) pts))
            (setq pts (cons (list p2 ent) pts))
          )
        )
      )
    )
    (setq i (1+ i))
  )
  pts
)

;; Greedy nearest-neighbour pass over loose endpoints: bridge anything
;; inside tol with a short LINE on CV-MERGED, flag anything wider with a
;; circle on CV-FLAGS instead of guessing. Returns (bridge-count flag-count).
(defun cv:bridge-gaps (endpts tol / pool p rest best bestd d bridge-count flag-count)
  (setq pool endpts)
  (setq bridge-count 0 flag-count 0)
  (while pool
    (setq p (car pool) pool (cdr pool))
    (setq best nil bestd nil)
    (foreach q pool
      (if (not (equal (cadr q) (cadr p)))
        (progn
          (setq d (distance (car p) (car q)))
          (if (or (not bestd) (< d bestd))
            (progn (setq bestd d best q))
          )
        )
      )
    )
    (cond
      ((and best (<= bestd 1e-6))
        ;; already touching -- nothing to do
      )
      ((and best (<= bestd tol))
        (entmake (list '(0 . "LINE") (cons 8 "CV-MERGED")
                        (cons 10 (car p)) (cons 11 (car best))))
        (setq bridge-count (1+ bridge-count))
        (cv:log (strcat "CV-CLOSE: bridged gap " (rtos bestd 2 3)
                          " units near " (vl-princ-to-string (car p))))
        (setq pool (vl-remove best pool))
      )
      (t
        (entmake (list '(0 . "CIRCLE") (cons 8 "CV-FLAGS")
                        (cons 10 (car p)) (cons 40 0.5)))
        (setq flag-count (1+ flag-count))
        (cv:log (strcat "CV-CLOSE: flagged open endpoint at " (vl-princ-to-string (car p))))
      )
    )
  )
  (list bridge-count flag-count)
)

;; ---------------------------------------------------------------------
;; commands
;; ---------------------------------------------------------------------

(defun c:CV-HELP ()
  (princ "\nCV Tools -- commands:")
  (princ "\n  CV-LAYERS    create the COL-* and CV-* working layers")
  (princ "\n  CV-MERGE     merge selected geometry onto CV-MERGED, remove overlaps/duplicates")
  (princ "\n  CV-HIDETEXT  hide all TEXT/MTEXT (toggle with CV-SHOWTEXT)")
  (princ "\n  CV-SHOWTEXT  restore hidden TEXT/MTEXT")
  (princ "\n  CV-CLOSE     auto-trace closed regions from CV-MERGED onto CV-PLOT-DRAFT")
  (princ "\n  CV-NEXT      zoom to the next flagged (unclosed) gap on CV-FLAGS")
  (princ)
)

(defun c:CV-LAYERS ( / layers)
  (setq layers '(("COL-SITE" . 1) ("COL-PLOT" . 3) ("COL-PLOT-NO" . 2)
                 ("COL-GARDEN" . 140) ("COL-AMENITY" . 30) ("COL-WATER" . 150)
                 ("COL-FEATURE-NO" . 6) ("COL-NORTH" . 5)
                 ("CV-MERGED" . 7) ("CV-PLOT-DRAFT" . 4) ("CV-FLAGS" . 1)))
  (foreach l layers (cv:ensure-layer (car l) (cdr l)))
  (cv:log (strcat "CV-LAYERS: ensured " (itoa (length layers)) " layers"))
  (princ (strcat "\nCV-LAYERS: " (itoa (length layers)) " layers ready."))
  (princ)
)

(defun c:CV-MERGE ( / ss before ss2 after)
  (cv:undo-begin)
  (princ "\nCV-MERGE: select the messy line/polyline geometry (window, crossing, or pick), then Enter.")
  (setq ss (ssget '((0 . "LINE,LWPOLYLINE,POLYLINE,ARC,CIRCLE"))))
  (if (not ss)
    (progn (princ "\nCV-MERGE: nothing selected, aborted.") (cv:undo-end))
    (progn
      (setq before (sslength ss))
      (cv:ensure-layer "CV-MERGED" 7)
      (cv:chlayer ss "CV-MERGED")
      (command "_.-overkill" ss "" "")
      (setq ss2 (ssget "X" '((8 . "CV-MERGED"))))
      (setq after (if ss2 (sslength ss2) 0))
      (cv:log (strcat "CV-MERGE: " (itoa before) " -> " (itoa after) " entities on CV-MERGED"))
      (princ (strcat "\nCV-MERGE: " (itoa before) " entities in, " (itoa after)
                       " remain after dedupe. Run again to pull in more geometry, or CV-CLOSE next."))
      (cv:undo-end)
    )
  )
  (princ)
)

(defun c:CV-HIDETEXT ( / ss i)
  (setq ss (ssget "X" '((0 . "TEXT,MTEXT"))))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (cv:set-invisible (ssname ss i) 1)
        (setq i (1+ i))
      )
      (cv:log (strcat "CV-HIDETEXT: hid " (itoa (sslength ss)) " text entities"))
      (princ (strcat "\nCV-HIDETEXT: " (itoa (sslength ss)) " text entities hidden. CV-SHOWTEXT to restore."))
    )
    (princ "\nCV-HIDETEXT: no text found.")
  )
  (princ)
)

(defun c:CV-SHOWTEXT ( / ss i)
  (setq ss (ssget "X" '((0 . "TEXT,MTEXT"))))
  (if ss
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (cv:set-invisible (ssname ss i) 0)
        (setq i (1+ i))
      )
      (cv:log (strcat "CV-SHOWTEXT: restored " (itoa (sslength ss)) " text entities"))
      (princ (strcat "\nCV-SHOWTEXT: " (itoa (sslength ss)) " text entities restored."))
    )
    (princ "\nCV-SHOWTEXT: no text found.")
  )
  (princ)
)

(defun c:CV-CLOSE ( / ssm gaptol spacing res bcount fcount bbox sweeppts olay ssd after)
  (cv:undo-begin)
  (setq ssm (ssget "X" '((8 . "CV-MERGED"))))
  (if (not ssm)
    (progn (princ "\nCV-CLOSE: no entities on CV-MERGED. Run CV-MERGE first.") (cv:undo-end))
    (progn
      (initget 6)
      (setq gaptol (getreal "\nGap tolerance to auto-close, drawing units <0.5>: "))
      (if (not gaptol) (setq gaptol 0.5))
      (initget 6)
      (setq spacing (getreal "\nApprox. smallest plot dimension, for the scan grid <20>: "))
      (if (not spacing) (setq spacing 20))
      (setq spacing (/ spacing 3.0))

      (cv:ensure-layer "CV-FLAGS" 1)
      (setq res (cv:bridge-gaps (cv:collect-endpoints ssm) gaptol))
      (setq bcount (car res) fcount (cadr res))

      (setq ssm (ssget "X" '((8 . "CV-MERGED"))))
      (setq bbox (cv:extents ssm))
      (setq sweeppts (cv:sweep-points bbox spacing))

      (cv:ensure-layer "CV-PLOT-DRAFT" 4)
      (setq olay (getvar "CLAYER"))
      (command "_.layiso" ssm "")
      (setvar "CLAYER" "CV-PLOT-DRAFT")

      (command "_.-boundary")
      (foreach pt sweeppts (command pt))
      (command "")

      (setvar "CLAYER" olay)
      (command "_.layuniso")

      (setq ssd (ssget "X" '((8 . "CV-PLOT-DRAFT"))))
      (if ssd
        (progn
          (command "_.-overkill" ssd "" "")
          (setq ssd (ssget "X" '((8 . "CV-PLOT-DRAFT"))))
          (setq after (if ssd (sslength ssd) 0))
        )
        (setq after 0)
      )

      (cv:log (strcat "CV-CLOSE: " (itoa after) " draft regions, "
                        (itoa bcount) " gaps bridged, " (itoa fcount) " flagged"))
      (princ (strcat "\nCV-CLOSE: " (itoa after) " closed region(s) on CV-PLOT-DRAFT. "
                       (itoa bcount) " gap(s) auto-bridged. "
                       (itoa fcount) " endpoint(s) flagged on CV-FLAGS -- run CV-NEXT to review."))
      (cv:undo-end)
    )
  )
  (princ)
)

(setq *cv-flag-idx* 0)

(defun c:CV-NEXT ( / ss n ent pt)
  (setq ss (ssget "X" '((0 . "CIRCLE") (8 . "CV-FLAGS"))))
  (if (not ss)
    (princ "\nCV-NEXT: no flags on CV-FLAGS layer.")
    (progn
      (setq n (sslength ss))
      (if (>= *cv-flag-idx* n) (setq *cv-flag-idx* 0))
      (setq ent (ssname ss *cv-flag-idx*))
      (setq pt (cdr (assoc 10 (entget ent))))
      (command "_.zoom" "_center" pt 20)
      (sssetfirst nil (ssadd ent))
      (princ (strcat "\nCV-NEXT: flag " (itoa (1+ *cv-flag-idx*)) " of " (itoa n)
                       " at " (vl-princ-to-string pt)))
      (setq *cv-flag-idx* (1+ *cv-flag-idx*))
    )
  )
  (princ)
)

(princ "\nCV Tools loaded -- type CV-HELP for the command list.")
(princ)
