export interface Player {
    id_player: string | null;
    username: string | null;
    register_date: string | null;
}

export interface GameSession {
    id_session: string | null ;
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
    state: "in_progress" | "finished" | "cancelled" | 'not_initied';
    bets: Bet[];

}


export interface Bet {
    id_bet: string;
    player: Player;
    amount: number;
    date_bet: string;
    ganancy: number | null;
    multiplyer: number | null;
    is_active: boolean;
}


let players:Player[]  = [
    {
        id_player: '1',
        username: 'Gabriel',
        register_date: null
    },
      {
        id_player: '2',
        username: 'Deivid',
        register_date: null
    },
      {
        id_player: '3',
        username: 'Edinson',
        register_date: null
    },
];
let gameHalls:GameHall[] = [
    {
        id_game_hall: '1',
        hall_name: 'Sala Principal',
        max_capacity: 10,
        active: true,
        actual_players: 0,
        created_at: new Date().toString(),
        game_sessions: [],
        game_rounds: [{
            id_round: '1',
            multiplyer: 2,
            start_date: new Date().toString(), 
            end_date: null,
            duration_seg: null,
            state: "not_initied",
            bets: []
        }]
    }
];


let gameHallsHistorical:GameHall[] = [
    {
        id_game_hall: '1',
        hall_name: 'Sala Principal',
        max_capacity: 10,
        active: true,
        actual_players: 0,
        created_at: new Date().toString(),
        game_sessions: [],
        game_rounds: [{
            id_round: '1',
            multiplyer: 2,
            start_date: new Date().toString(), 
            end_date: null,
            duration_seg: null,
            state: "not_initied",
            bets: []
        }]
    }
];



// tener en cuenta que el id es el del socket, por lo tanto es temporal, no debe asociarse al player sino al game session
export function addSessionPlayer(player: Player) {
    gameHalls[0].game_sessions.push(
        {   
            date_ingress: new Date().toString(),
            date_exit: null,
            player: player,
            id_session: player.id_player
        }
    )
    return player;
}   
export function getPlayers() {
    return players;
}   

export function getSessionPlayers() {
    return gameHalls[0].game_sessions;
}

export function removePlayerFromSessions(id_socket: string) {
  gameHalls.forEach((hall) => {
    hall.game_sessions = hall.game_sessions.filter(
      (session) => session.id_session !== id_socket
    );
    hall.actual_players = hall.game_sessions.length;
  });
}

export function addSessionToHall(player: any) {
    const session:any = {
        player: player,
        date_ingress: new Date().toString(),
        date_exit: null
    };
    gameHalls[0].game_sessions.push(session);
    return session;
}

export function addBetToCurrentRound(playerId: string, amount: number) {
    const player = players?.find(p => p.id_player === playerId);
    console.log('el player', player)
    if (!player) return null;   
    console.log('el playerrrrr', player)
    const currentRound = gameHalls[0].game_rounds[0]
    if (!currentRound) return null;   
    currentRound.bets.push({
        id_bet: (currentRound.bets.length + 1).toString(),
        player: player,
        amount: amount,
        date_bet: new Date().toString(),
        ganancy: null,
        multiplyer: null,
        is_active: true
    });
    gameHallsHistorical = JSON.parse(JSON.stringify(gameHalls));
    return player;
}

export function cancelBet(playerId: string, currentMultiplier: number) {
    // Encuentra la ronda actual
    const currentRound = getGameHall(0).game_rounds[0];
    if (!currentRound) return null;

    // Encuentra la apuesta del jugador con tipo explícito
    const betIndex = currentRound.bets.findIndex(
        (bet: Bet) => bet.player.id_player === playerId && bet.is_active
    );

    if (betIndex === -1) return null;

    const bet = currentRound.bets[betIndex];
    
    // Si la ronda está en progreso, calcula la ganancia
    if (currentRound.state === 'in_progress') {
        bet.ganancy = bet.amount * currentMultiplier;
        bet.multiplyer = currentMultiplier;
    } else {
        // Si la ronda no está en progreso o ya terminó, no hay ganancia
        bet.ganancy = 0;
        bet.multiplyer = null;
    }

    bet.is_active = false;
    return bet;
}

export function deleteBetFromPlayer() {
    const currentRound = gameHalls[0].game_rounds[0];
    if (!currentRound) return null;
    currentRound.bets = currentRound.bets.filter(b => !b.is_active);
    return currentRound.bets;   
}

export function getGameHall(position:number):any {
    return gameHalls[position];
}

export function setRoundStatusHall(hallNumber:number, roundNumber: number, newState: "in_progress" | "finished" | "cancelled" | 'not_initied'){
    gameHalls[hallNumber].game_rounds[roundNumber].state = newState;
    return gameHalls[hallNumber].game_rounds[roundNumber].state;
}

export function getRoundStatusHall(hallNumber:number, roundNumber: number){
    return gameHalls[hallNumber].game_rounds[roundNumber].state;
}