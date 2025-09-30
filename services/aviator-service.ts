import { Server } from "socket.io";

export interface PlaneUpdate {
  multiplier: number;
  timestamp: number;
}

export interface RoundStartPayload {
  crashPoint: number;
}

export interface RoundEndPayload {
  finalMultiplier: number;
}

export class RoundService {
  private io: Server;
  private isRunning: boolean;
  private multiplier: number;
  private interval: NodeJS.Timeout | null;
  private crashPoint: number;

  constructor(io: Server) {
    this.io = io;
    this.isRunning = false;
    this.multiplier = 1.0;
    this.interval = null;
    this.crashPoint = 0;
  }

  public startRound(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.multiplier = 1.0;
    this.crashPoint = parseFloat((Math.random() * 9 + 1.1).toFixed(2));
    console.log(`🎲 CrashPoint generado: ${this.crashPoint}x`);

    const startPayload: RoundStartPayload = { crashPoint: this.crashPoint };
    this.io.emit("round_start", startPayload);

    this.interval = setInterval(() => {
      if (this.multiplier >= this.crashPoint) {
        this.endRound();
      } else {
        this.multiplier += 0.01;

        const updatePayload: PlaneUpdate = {
          multiplier: parseFloat(this.multiplier.toFixed(2)),
          timestamp: Date.now(),
        };

        this.io.emit("plane_update", updatePayload);
      }
    }, 100);
  }

  public endRound(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log("💥 El avión se estrelló en", this.multiplier.toFixed(2), "x");

    const endPayload: RoundEndPayload = {
      finalMultiplier: parseFloat(this.multiplier.toFixed(2)),
    };

    this.io.emit("round_end", endPayload);
  }

  public getCurrentMultiplier(): number {
    return parseFloat(this.multiplier.toFixed(2));
  }

  public getCrashPoint(): number {
    return this.crashPoint;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export function generateRoundService (io: Server){
    return new RoundService(io);
}
