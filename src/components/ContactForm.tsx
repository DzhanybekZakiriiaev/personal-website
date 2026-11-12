import { useId, useState, type FormEvent } from 'react';
import { contactForm } from '../content';
import './contact-form.css';

type Status = 'idle' | 'sending' | 'sent' | 'error';

// A felt letter you write on: name, email and message, posted with the stamp.
// It sends to a form service endpoint (see contactForm in content.ts), so the
// email address itself never appears on the site.
export function ContactForm() {
  const id = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const ready = contactForm.endpoint !== '';

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('company')) return; // the hidden field only bots fill in
    if (!ready) {
      setStatus('error');
      setError('The letterbox isn’t connected yet. Please message me on LinkedIn for now.');
      return;
    }
    setStatus('sending');
    setError('');
    try {
      const response = await fetch(contactForm.endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      });
      if (!response.ok) throw new Error(String(response.status));
      form.reset();
      setStatus('sent');
    } catch {
      setStatus('error');
      setError('That letter didn’t go through. Please try again, or message me on LinkedIn.');
    }
  };

  if (status === 'sent') {
    return (
      <div className="cf cf--sent" role="status">
        <span className="cf-sent-stamp" aria-hidden="true">
          Sent!
        </span>
        <p className="cf-sent-title">Your letter is on its way.</p>
        <p className="cf-sent-text">Thanks for writing. I’ll get back to you by email soon.</p>
        <button type="button" className="cf-again" onClick={() => setStatus('idle')}>
          Write another
        </button>
      </div>
    );
  }

  return (
    <form className="cf" onSubmit={onSubmit} noValidate={false}>
      <div className="cf-flap" aria-hidden="true" />
      <p className="cf-intro">Write me a letter and it lands straight in my inbox.</p>

      <div className="cf-row">
        <div className="cf-field">
          <label htmlFor={`${id}-name`}>Your name</label>
          <input id={`${id}-name`} name="name" type="text" autoComplete="name" required maxLength={120} />
        </div>
        <div className="cf-field">
          <label htmlFor={`${id}-email`}>Your email</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={200} />
        </div>
      </div>

      <div className="cf-field">
        <label htmlFor={`${id}-message`}>Message</label>
        <textarea id={`${id}-message`} name="message" rows={6} required maxLength={5000} />
      </div>

      {/* Spam trap: hidden from people and assistive tech, left empty by real visitors. */}
      <div className="cf-trap" aria-hidden="true">
        <label htmlFor={`${id}-company`}>Company</label>
        <input id={`${id}-company`} name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="_subject" value="New message from your website" />

      <div className="cf-actions">
        <button type="submit" className="cf-send" disabled={status === 'sending'}>
          <span className="cf-send-stamp" aria-hidden="true" />
          {status === 'sending' ? 'Posting…' : 'Send letter'}
        </button>
        <p className="cf-status" role="status" aria-live="polite">
          {status === 'error' ? error : ''}
        </p>
      </div>
    </form>
  );
}
