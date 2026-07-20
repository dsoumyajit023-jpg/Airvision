export class SliderControl {
  private readonly inputEl: HTMLInputElement;
  private readonly valueEl: HTMLElement | null;

  constructor(
    inputEl: HTMLInputElement,
    valueEl: HTMLElement | null,
    private readonly onChange: (value: number) => void
  ) {
    this.inputEl = inputEl;
    this.valueEl = valueEl;
    this.inputEl.addEventListener("input", () => this.handleInput());
    this.updateLabel(this.value);
  }

  private handleInput(): void {
    const v = this.value;
    this.updateLabel(v);
    this.onChange(v);
  }

  private updateLabel(v: number): void {
    if (this.valueEl) {
      this.valueEl.textContent = `${Math.round(v * 100)}%`;
    }
  }

  public get value(): number {
    return Number(this.inputEl.value) / 100;
  }

  public set value(v: number) {
    this.inputEl.value = String(Math.round(v * 100));
    this.updateLabel(v);
  }
}
