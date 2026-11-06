/** Horloge injectable (les tests utilisent une horloge manuelle). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export class ManualClock implements Clock {
  private current: Date;
  constructor(start: Date = new Date()) {
    this.current = new Date(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  set(d: Date): void {
    this.current = new Date(d);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
