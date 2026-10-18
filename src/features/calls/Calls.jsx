import { useState } from "react";

import GazeButton from "../../components/GazeButton.jsx";
import Pager, { usePaged } from "../../components/Pager.jsx";
import { useMessage } from "../../app/MessageContext.jsx";
import { useUserContent } from "../../app/UserContentContext.jsx";
import { initials, isLikelyPhoneDevice, normalizePhone, smsHref, sortContacts, telHref, whatsappHref } from "./phone.js";

const AVATAR_COLORS = 6;
// Eyes cannot scroll, so a long contact list is split into pages.
const PAGE_SIZE = 8;

function colorIndex(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % AVATAR_COLORS;
}

export default function Calls() {
  const content = useUserContent();
  const message = useMessage();
  const [chosen, setChosen] = useState(null);
  const [handedOff, setHandedOff] = useState(null); // { contact, kind }
  const [managing, setManaging] = useState(false);
  const contacts = sortContacts(content.contacts);
  const paged = usePaged(contacts, PAGE_SIZE);
  const phoneDevice = isLikelyPhoneDevice();

  const handOff = (contact, kind) => {
    // Let the link open the dialer first, then swap the dialog.
    setTimeout(() => {
      if (kind === "call") content.countCall(contact.id);
      setChosen(null);
      setHandedOff({ contact, kind });
    }, 0);
  };

  return (
    <div className="calls">
      <p className="platform-note">
        {phoneDevice
          ? "Calls open your phone's own dialer. Your phone places and ends the call."
          : "Calls open this computer's calling app (for example Phone Link on Windows or FaceTime on a Mac) if one is set up. Without one, nothing will ring."}
        {" "}This app cannot see whether a call connects.
      </p>

      {contacts.length === 0 && !managing && (
        <div className="empty-state">
          <p>No contacts yet. A helper can add family members and carers here.</p>
          <button type="button" className="btn btn--primary" onClick={() => setManaging(true)}>Add contacts</button>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="card-grid card-grid--contacts">
          {paged.items.map((contact, index) => (
            <GazeButton key={contact.id} className="contact-card" onClick={() => setChosen(contact)} aria-label={`${contact.name}${contact.relation ? `, ${contact.relation}` : ""}`}>
              <span className={`avatar avatar--${colorIndex(contact.name)}`} aria-hidden="true">{contact.emoji || initials(contact.name)}</span>
              <span className="contact-card__name">{contact.name}</span>
              {contact.relation && <span className="contact-card__relation">{contact.relation}</span>}
              {paged.page === 0 && index < 3 && (contact.calls || 0) > 0 && <span className="contact-card__badge">Frequent</span>}
            </GazeButton>
          ))}
        </div>
      )}

      {contacts.length > 0 && <Pager paged={paged} label="contacts" />}

      {!managing && contacts.length > 0 && (
        <div className="helper-row">
          <button type="button" className="btn" onClick={() => setManaging(true)}>Manage contacts (helper)</button>
        </div>
      )}
      {managing && <ContactManager onClose={() => setManaging(false)} />}

      {chosen && (
        <div className="modal" data-gaze-modal role="dialog" aria-modal="true" aria-label={`Contact ${chosen.name}`}>
          <div className="modal__panel">
            <div className="modal__head">
              <span className={`avatar avatar--large avatar--${colorIndex(chosen.name)}`} aria-hidden="true">{chosen.emoji || initials(chosen.name)}</span>
              <div>
                <h2 className="modal__title">{chosen.name}</h2>
                <p className="muted">{chosen.relation ? `${chosen.relation} · ` : ""}{chosen.phone}</p>
              </div>
            </div>
            <div className="modal__actions">
              <GazeButton href={telHref(chosen.phone)} variant="primary" icon="phone" label={`Call ${chosen.name}`} dwell={1.3} onClick={() => handOff(chosen, "call")} />
              <GazeButton
                href={smsHref(chosen.phone, message.text)}
                icon="message"
                label="Send my message by SMS"
                sublabel={message.text ? `“${message.text.slice(0, 60)}${message.text.length > 60 ? "…" : ""}”` : "Your message is empty; opens an empty SMS"}
                onClick={() => handOff(chosen, "sms")}
              />
              {whatsappHref(chosen.phone) && (
                <GazeButton
                  href={whatsappHref(chosen.phone, message.text)}
                  target="_blank"
                  rel="noreferrer"
                  icon="external"
                  label="Send my message on WhatsApp"
                  sublabel="Opens WhatsApp; press Send there"
                  onClick={() => handOff(chosen, "whatsapp")}
                />
              )}
              <GazeButton icon="close" label="Cancel" onClick={() => setChosen(null)} />
            </div>
          </div>
        </div>
      )}

      {handedOff && (
        <div className="modal" data-gaze-modal role="dialog" aria-modal="true" aria-label="Call status">
          <div className="modal__panel">
            <h2 className="modal__title">
              {handedOff.kind === "call" ? `Calling ${handedOff.contact.name} with your phone app` : `Message for ${handedOff.contact.name} opened`}
            </h2>
            <p>
              {handedOff.kind === "call"
                ? "The dialer or calling app was asked to start the call. This app cannot see whether it connects. Use the phone or calling app to end the call, then come back here."
                : "Your messaging app was opened with the message filled in. The message is only sent when someone presses Send there."}
            </p>
            <p className="muted small">If nothing opened, this device may have no phone or messaging app linked to the browser.</p>
            <div className="modal__actions">
              <GazeButton variant="primary" icon="check" label="Done" onClick={() => setHandedOff(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Helper-facing form: plain inputs, not gaze targets. */
function ContactManager({ onClose }) {
  const content = useUserContent();
  const empty = { id: "", name: "", phone: "", relation: "", emoji: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  const save = (event) => {
    event.preventDefault();
    const phone = normalizePhone(form.phone);
    if (!form.name.trim()) return setError("Enter a name.");
    if (!phone) return setError("Enter a phone number with 3 to 15 digits. Start with + and the country code (for example +91) so WhatsApp also works.");
    content.saveContact({ ...form, name: form.name.trim(), relation: form.relation.trim(), emoji: form.emoji.trim(), phone });
    setForm(empty);
    setError("");
    return undefined;
  };

  return (
    <section className="panel" aria-label="Manage contacts">
      <h2 className="section-title">{form.id ? "Edit contact" : "Add a contact"}</h2>
      <form className="form-grid" onSubmit={save}>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={40} /></label>
        <label>Phone number<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="+91 98765 43210" required /></label>
        <label>Relation (optional)<input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Son, daughter, carer…" maxLength={30} /></label>
        <label>Picture emoji (optional)<input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="👦" maxLength={8} /></label>
        {error && <p className="notice notice--danger" role="alert">{error}</p>}
        <div className="toolbar-row">
          <button type="submit" className="btn btn--primary">{form.id ? "Save changes" : "Add contact"}</button>
          {form.id && <button type="button" className="btn" onClick={() => setForm(empty)}>Cancel edit</button>}
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </form>
      {content.contacts.length > 0 && (
        <ul className="manage-list">
          {content.contacts.map((contact) => (
            <li key={contact.id}>
              <span>{contact.emoji} {contact.name} · {contact.phone}{contact.relation ? ` · ${contact.relation}` : ""}</span>
              <span className="toolbar-row">
                <button type="button" className="btn btn--small" onClick={() => setForm({ ...empty, ...contact })}>Edit</button>
                <button type="button" className="btn btn--small" onClick={() => {
                  if (window.confirm(`Delete ${contact.name}?`)) content.removeContact(contact.id);
                }}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
