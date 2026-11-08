/** Общий фильтр: drag и любой мультитач никогда не превращаются в tap. */
export class TapGesture {
  private pointers = new Set<number>();
  private origin?: { id: number; x: number; y: number; time: number };
  private blocked = false;
  down(id: number, x: number, y: number, time: number) {
    if (!this.pointers.size) {
      this.blocked = false;
      this.origin = { id, x, y, time };
    }
    this.pointers.add(id);
    if (this.pointers.size > 1) this.blocked = true;
  }
  move(id: number, x: number, y: number) {
    if (
      this.origin?.id === id &&
      Math.hypot(x - this.origin.x, y - this.origin.y) > 7
    )
      this.blocked = true;
  }
  up(id: number, x: number, y: number, time: number): boolean {
    this.move(id, x, y);
    const tap =
      !this.blocked &&
      this.pointers.size === 1 &&
      this.origin?.id === id &&
      time - this.origin.time < 450;
    this.pointers.delete(id);
    if (!this.pointers.size) this.origin = undefined;
    return tap;
  }
  cancel() {
    this.blocked = true;
    this.pointers.clear();
    this.origin = undefined;
  }
}
