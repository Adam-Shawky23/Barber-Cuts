import type { Look } from '../state/session';

export function ShowBarber({ look, onClose }: { look: Look; onClose(): void }) {
  return (
    <main className="screen barber">
      <div className="stage">
        <img src={look.image} alt={look.label} />
        <div className="stylename">
          <b className="display">{look.label}</b>
        </div>
      </div>
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        Close
      </button>
    </main>
  );
}
