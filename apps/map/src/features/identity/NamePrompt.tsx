import { useState, type FormEvent } from "react";

interface Props {
  onSubmit: (name: string) => void;
}

// One-time "who's using this device?" prompt (D-016) — shown until a name is stored,
// never again after. No roster, no validation beyond non-empty; five trusted family
// members typing their own name is the whole trust model here.
export function NamePrompt({ onSubmit }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="name-prompt-overlay">
      <form className="name-prompt-card" onSubmit={handleSubmit}>
        <h1>Who&apos;s using this device?</h1>
        <p>Your name is shown next to any change you make.</p>
        <input
          className="name-prompt-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Your name"
          autoFocus
        />
        <button type="submit" className="name-prompt-submit" disabled={!value.trim()}>
          Continue
        </button>
      </form>
    </div>
  );
}
