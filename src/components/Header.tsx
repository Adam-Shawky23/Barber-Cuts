type HeaderProps = {
  onNewCustomer(): void;
  onLookbook(): void;
  lookCount: number;
  busy: boolean;
};

export function Header({ onNewCustomer, onLookbook, lookCount, busy }: HeaderProps) {
  return (
    <header className="header">
      <div className="brand-wrap">
        <span className="brand">
          FRESH<span className="gold">CUT</span>
        </span>
        <span className="pole" aria-hidden="true" />
      </div>
      <nav className="header-actions">
        <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={onLookbook}>
          Lookbook <span className="count">{lookCount}</span>
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onNewCustomer}>
          New customer
        </button>
      </nav>
    </header>
  );
}
