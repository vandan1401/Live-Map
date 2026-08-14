import { markInstallInstructionsSeen } from "../../pwa/installInstructionsSeen.ts";

interface Props {
  onDismiss: () => void;
}

// One-time screen (spec/07). iOS gives no install prompt and the flow only works in
// Safari, not Chrome — this is the hand-holding spec/07 says to budget for.
export function InstallInstructions({ onDismiss }: Props) {
  const dismiss = () => {
    markInstallInstructionsSeen();
    onDismiss();
  };

  return (
    <div className="install-instructions-overlay">
      <div className="install-instructions-card">
        <h1>Add Colony Map to your home screen</h1>
        <img
          className="install-instructions-illustration"
          src="/images/install-instructions.png"
          alt="Tap the Share icon, then Add to Home Screen"
          width={480}
          height={160}
        />
        <p>On iPhone, in Safari:</p>
        <ol>
          <li>Tap the Share button.</li>
          <li>Scroll down and tap &quot;Add to Home Screen&quot;.</li>
          <li>Tap &quot;Add&quot;.</li>
        </ol>
        <p>The app opens full-screen and works without internet once installed.</p>
        <button type="button" className="install-instructions-dismiss" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
