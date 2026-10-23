'use strict';
/* ==========================================================
   RANKING — pontuação dos palpites
   Regras (ajuste aqui se mudarem):
   - Palpite = placar exato (mandante x visitante) + lista de artilheiros.
   - Placar exato (ex.: Vasco 3 x 0 Vitória e o jogo terminou 3 x 0) = 3 pontos.
   - Acertou o resultado (vencedor ou empate), mas não o placar exato = 1 ponto.
   - Errou o resultado (empate inesperado ou derrota do time palpitado) = 0 ponto.
   - Cada jogador escolhido como artilheiro que marcar gol (1 ou mais)
     soma +1 ponto, independentemente do resultado.
   - Só entram jogos já encerrados, com os marcadores informados, e a
     contagem começa no primeiro jogo ocorrido depois do cadastro.
   ========================================================== */

const { POINTS } = require('../js/data.js');

const RULES = Object.freeze({ ...POINTS });

const norm = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');

const kickoffMs = (game) => Date.parse(`${game.date}T${game.time}:00-03:00`);

// Jogo só é julgado quando todo time que marcou já tem nomes de marcadores.
function isGameReady(game) {
  return (game.homeGoals === 0 || game.scorersHome.length > 0) &&
         (game.awayGoals === 0 || game.scorersAway.length > 0);
}

function judgeBet(bet, game) {
  const guessHome = Number(bet.guessHome);
  const guessAway = Number(bet.guessAway);
  const picked = Array.isArray(bet.scorers) ? bet.scorers : [];
  if (!Number.isInteger(guessHome) || !Number.isInteger(guessAway) || guessHome < 0 || guessAway < 0) {
    return { exactHit: false, outcomeHit: false, scorerHits: 0 };
  }

  const exactHit = guessHome === game.homeGoals && guessAway === game.awayGoals;
  const outcomeHit = !exactHit &&
    Math.sign(guessHome - guessAway) === Math.sign(game.homeGoals - game.awayGoals);

  const allScorers = [...game.scorersHome, ...game.scorersAway];
  const scorerHits = picked.filter((name) => allScorers.some((actual) => norm(actual) === norm(name))).length;

  return { exactHit, outcomeHit, scorerHits };
}

/**
 * @param {object} input
 * @param {Array}  input.users  { id, name, favoriteTeamId, createdAt }
 * @param {Array}  input.games  { id, date, time, homeId, awayId, homeGoals, awayGoals, scorersHome, scorersAway, onSite }
 * @param {Array}  input.bets   { userId, gameId, guessHome, guessAway, scorers }
 */
function computeRanking({ users, games, bets, rules = RULES }) {
  // Ordem cronológica; para na primeira partida ainda sem marcadores,
  // porque os jogos precisam ser julgados na ordem em que ocorreram.
  const finished = games
    .filter((g) => g.onSite && g.homeGoals !== null && g.awayGoals !== null)
    .sort((a, b) => kickoffMs(a) - kickoffMs(b));
  const judged = [];
  for (const game of finished) {
    if (!isGameReady(game)) break;
    judged.push(game);
  }

  const betByUserGame = new Map(bets.map((b) => [`${b.userId}|${b.gameId}`, b]));

  const rows = users
    .filter((u) => u.favoriteTeamId)
    .map((user) => {
      const joinedAt = Date.parse(user.createdAt);
      let points = 0;
      let exactHits = 0;
      let outcomeHits = 0;
      let scorerHits = 0;
      let gamesCounted = 0;

      for (const game of judged) {
        if (game.homeId !== user.favoriteTeamId && game.awayId !== user.favoriteTeamId) continue;
        if (kickoffMs(game) <= joinedAt) continue;
        gamesCounted += 1;

        const bet = betByUserGame.get(`${user.id}|${game.id}`);
        const result = bet ? judgeBet(bet, game) : { exactHit: false, outcomeHit: false, scorerHits: 0 };

        points += (result.exactHit ? rules.exact : result.outcomeHit ? rules.outcome : 0) + result.scorerHits * rules.scorer;
        if (result.exactHit) exactHits += 1;
        else if (result.outcomeHit) outcomeHits += 1;
        scorerHits += result.scorerHits;
      }

      return {
        userId: user.id,
        name: user.name,
        favoriteTeamId: user.favoriteTeamId,
        points,
        exactHits,
        outcomeHits,
        scorerHits,
        gamesCounted
      };
    });

  rows.sort((a, b) => b.points - a.points || b.exactHits - a.exactHits || b.scorerHits - a.scorerHits ||
    b.outcomeHits - a.outcomeHits || a.name.localeCompare(b.name, 'pt-BR'));

  // Empates recebem a mesma posição (ex.: 1º, 1º, 3º)
  let position = 0;
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.points === row.points && prev.exactHits === row.exactHits && prev.scorerHits === row.scorerHits;
    position = tied ? position : i + 1;
    row.position = position;
  });

  return { rows, gamesJudged: judged.length, rules };
}

module.exports = { computeRanking, judgeBet, RULES };
