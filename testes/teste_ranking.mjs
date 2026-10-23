// Testes do motor de ranking (sem servidor, sem banco). Rode: node testes/teste_ranking.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { computeRanking, judgeBet } = require('../server/ranking.js');

const created = '2026-01-01T00:00:00.000Z';
const user = { id: 1, name: 'Ana', favoriteTeamId: 'vasco', createdAt: created };
const rival = { id: 2, name: 'Bia', favoriteTeamId: 'vasco', createdAt: created };
const noTeam = { id: 3, name: 'Caio', favoriteTeamId: null, createdAt: created };

// Jogos do Vasco (casa) x Vitória, em ordem cronológica
// Por padrão, quem marcou gol tem marcador informado (o caso "sem marcador" é testado à parte)
const g = (n, homeGoals, awayGoals, sh, sa) => ({
  id: `g${n}`, date: `2026-02-${String(n).padStart(2, '0')}`, time: '19:00',
  homeId: 'vasco', awayId: 'vitoria', homeGoals, awayGoals,
  scorersHome: sh ?? (homeGoals > 0 ? ['Pedro'] : []),
  scorersAway: sa ?? (awayGoals > 0 ? ['Fred'] : []),
  onSite: true
});
const bet = (gameId, guessHome, guessAway, scorers = [], userId = 1) => ({
  userId, gameId, guessHome, guessAway, scorers
});

// 1) Placar exato (3 pts) + artilheiro (+1) = 4 pontos
{
  const r = computeRanking({ users: [user], games: [g(1, 3, 0)], bets: [bet('g1', 3, 0, ['Pedro'])] }).rows[0];
  assert.equal(r.points, 4);
  assert.equal(r.exactHits, 1);
  assert.equal(r.scorerHits, 1);
  assert.equal(r.gamesCounted, 1);
}

// 2) Resultado certo, placar errado = 1 ponto (ex.: palpitou 2x0, terminou 3x0)
{
  const r = computeRanking({ users: [user], games: [g(1, 3, 0)], bets: [bet('g1', 2, 0, ['Ninguém'])] }).rows[0];
  assert.equal(r.points, 1);
  assert.equal(r.exactHits, 0);
  assert.equal(r.outcomeHits, 1);
}

// 3) Empate palpitado com placar diferente também é "resultado certo" (1x1 -> 2x2 = 1 ponto)
{
  const r = computeRanking({ users: [user], games: [g(1, 2, 2)], bets: [bet('g1', 1, 1)] }).rows[0];
  assert.equal(r.points, 1);
  assert.equal(r.outcomeHits, 1);
}

// 4) Derrota do time palpitado como vencedor = 0 ponto
{
  const r = computeRanking({ users: [user], games: [g(1, 0, 1)], bets: [bet('g1', 2, 0)] }).rows[0];
  assert.equal(r.points, 0);
  assert.equal(r.outcomeHits, 0);
}

// 5) Empate inesperado quando palpitou vitória = 0 ponto
{
  const r = computeRanking({ users: [user], games: [g(1, 1, 1)], bets: [bet('g1', 2, 1)] }).rows[0];
  assert.equal(r.points, 0);
}

// 6) 0 x 0 exato = placar exato (3 pontos)
{
  const r = computeRanking({ users: [user], games: [g(1, 0, 0)], bets: [bet('g1', 0, 0)] }).rows[0];
  assert.equal(r.points, 3);
  assert.equal(r.exactHits, 1);
}

// 7) Artilheiro vale +1 mesmo errando o resultado (palpitou 2x0, deu 0x1, mas Fred marcou)
{
  const r = computeRanking({ users: [user], games: [g(1, 0, 1)], bets: [bet('g1', 2, 0, ['Fred'])] }).rows[0];
  assert.equal(r.points, 1);
  assert.equal(r.scorerHits, 1);
}

// 8) Vários artilheiros: cada um que marcar vale +1 (independe de quantos gols)
{
  const r = computeRanking({ users: [user], games: [g(1, 3, 0, ['Pedro', 'Nuno', 'David'])], bets: [bet('g1', 3, 0, ['Pedro', 'David', 'Nuno'])] }).rows[0];
  // 3 (placar exato) + 3 artilheiros acertados = 6
  assert.equal(r.points, 6);
  assert.equal(r.scorerHits, 3);
}

// 9) Acento/caixa não impedem o acerto do artilheiro
{
  const jogo = g(1, 1, 0, ['Germán Cano']);
  const resultado = judgeBet(bet('g1', 1, 0, ['german cano']), jogo);
  assert.equal(resultado.scorerHits, 1);
}

// 10) Sem palpite no jogo = 0 ponto, mas o jogo entra na contagem
{
  const r = computeRanking({ users: [user], games: [g(1, 3, 0)], bets: [] }).rows[0];
  assert.equal(r.points, 0);
  assert.equal(r.gamesCounted, 1);
}

// 11) Jogos anteriores ao cadastro não contam
{
  const tardio = { id: 9, name: 'Tardia', favoriteTeamId: 'vasco', createdAt: '2026-02-02T00:00:00.000Z' };
  const games = [g(1, 1, 0), g(2, 2, 0)];
  const bets = [bet('g1', 1, 0), bet('g2', 2, 0), bet('g2', 2, 0, [], 9)];
  const ana = computeRanking({ users: [user], games, bets }).rows[0];
  assert.equal(ana.points, 3 + 3);
  const rows = computeRanking({ users: [tardio], games, bets }).rows;
  assert.equal(rows[0].gamesCounted, 1); // só o jogo do dia 02/02 é posterior ao cadastro
  assert.equal(rows[0].points, 3);
}

// 12) Jogo com gol sem marcador informado não é julgado ainda
{
  const games = [g(1, 2, 0, [])]; // 2 gols do mandante, nenhum marcador informado
  const r = computeRanking({ users: [user], games, bets: [bet('g1', 2, 0)] });
  assert.equal(r.gamesJudged, 0);
  assert.equal(r.rows[0].gamesCounted, 0);
}

// 13) Placar antigo/incompleto no palpite não explode (palpite legado)
{
  const resultado = judgeBet({ userId: 1, gameId: 'g1', guessHome: null, guessAway: null, scorers: [] }, g(1, 1, 0));
  assert.deepEqual(resultado, { exactHit: false, outcomeHit: false, scorerHits: 0 });
}

// 14) Desempate: pontos > placares exatos > artilheiros; empate real dividem a posição
{
  const games = [g(1, 3, 0), g(2, 1, 1)];
  const bets = [
    bet('g1', 3, 0, ['Pedro'], 1), bet('g2', 1, 1, [], 1), // Ana: 4 + 3 = 7 pts
    bet('g1', 3, 0, [], 2), bet('g2', 1, 1, [], 2)         // Bia: 3 + 3 = 6 pts
  ];
  const rows = computeRanking({ users: [user, rival], games, bets }).rows;
  assert.equal(rows[0].name, 'Ana');
  assert.equal(rows[0].position, 1);
  assert.equal(rows[1].name, 'Bia');
  assert.equal(rows[1].position, 2);

  const empate = computeRanking({
    users: [user, rival], games, bets: [bet('g1', 3, 0, [], 1), bet('g1', 3, 0, [], 2)]
  }).rows;
  assert.equal(empate[0].position, 1);
  assert.equal(empate[1].position, 1);
}

// 15) Usuário sem time fixo fica fora do ranking
{
  const r = computeRanking({ users: [user, noTeam], games: [g(1, 1, 0)], bets: [bet('g1', 1, 0)] });
  assert.equal(r.rows.length, 1);
}

console.log('Todos os testes do ranking passaram.');
