export interface Player {
    id_player: string | null;
    username: string | null;
    register_date: string | null;
}

export interface GameSession {
    player: Player;
    date_ingress: string;
    date_exit: string | null;
}   

export interface GameHall {
    id_game_hall: string;
    hall_name: string;
    max_capacity: number;
    active: boolean;
    actual_players: number;
    created_at: string;
    game_sessions: GameSession[];
    game_rounds: GameRound[];
}

export interface GameRound {
    id_round: string;
    multiplyer: number;
    start_date: string;
    end_date: string | null;
    duration_seg: number | null;
    state: "in_progress" | "finished" | "cancelled";
    bets: Bet[];

}


export interface Bet {
    id_bet: string;
    player: Player;
    amount: number;
    date_bet: string;
    ganancy: number | null;
    multiplyer: number | null;

}

