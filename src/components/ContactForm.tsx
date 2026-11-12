import { contactEmail } from '../content';
import './contact-form.css';

// "Write to me": a felt letter with a postage-stamp button that opens the
// visitor's email app, addressed to Johnny.
export function ContactForm() {
  const href = `mailto:${contactEmail}?subject=${encodeURIComponent('Hello from your website')}`;
  return (
    <div className="cf">
      <div className="cf-flap" aria-hidden="true" />
      <p className="cf-intro">Write me a letter: tell me about a co-op, a project or a research idea.</p>
      <p className="cf-address">
        <span className="cf-address-label">Address</span>
        <a href={href}>{contactEmail}</a>
      </p>
      <div className="cf-actions">
        <a className="cf-send" href={href}>
          <span className="cf-send-stamp" aria-hidden="true" />
          Write an email
        </a>
      </div>
    </div>
  );
}
