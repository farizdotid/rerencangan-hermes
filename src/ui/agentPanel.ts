import type { AgentDescription } from './describe';

/** Info panel for the selected agent. Content is set via textContent only. */
export class AgentPanel {
  private readonly el = document.createElement('section');
  private readonly title = document.createElement('h2');
  private readonly badge = document.createElement('span');
  private readonly list = document.createElement('dl');
  private readonly note = document.createElement('p');
  private readonly onKey: (e: KeyboardEvent) => void;

  constructor(parent: HTMLElement, onClose: () => void) {
    this.el.className = 'agent-panel';
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;

    const header = document.createElement('header');
    this.badge.className = 'agent-badge';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'agent-close';
    close.setAttribute('aria-label', 'Tutup');
    close.textContent = '×';
    close.addEventListener('click', onClose);
    header.append(this.title, this.badge, close);

    this.note.className = 'agent-note';
    this.el.append(header, this.list, this.note);
    parent.appendChild(this.el);

    this.onKey = (e) => {
      if (e.key === 'Escape' && !this.el.hidden) onClose();
    };
    window.addEventListener('keydown', this.onKey);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(desc: AgentDescription): void {
    this.title.textContent = desc.title;
    this.badge.textContent = desc.stateLabel;
    this.badge.dataset.state = desc.state;

    const items: HTMLElement[] = [];
    for (const row of desc.rows) {
      const dt = document.createElement('dt');
      dt.textContent = row.label;
      const dd = document.createElement('dd');
      dd.textContent = row.value;
      items.push(dt, dd);
    }
    this.list.replaceChildren(...items);

    this.note.textContent = desc.note ?? '';
    this.note.hidden = !desc.note;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}
