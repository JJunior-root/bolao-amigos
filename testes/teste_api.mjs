const BASE = 'http://localhost:3300';
const jar = {};
async function call(method, path, body, who = 'anon') {
  const headers = { 'Content-Type': 'application/json' };
  if (jar[who]) headers.Cookie = jar[who];
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const ok = (cond, msg) => console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg);

(async () => {
  // Users
  let r = await call('POST', '/api/signup', { name: 'Ana', email: 'ana@teste.com', password: '123456' }, 'ana');
  ok(r.status === 201 && r.data.user.role === 'user', 'cadastro de usuário');
  r = await call('POST', '/api/signup', { name: 'Ana 2', email: 'ANA@teste.com', password: '123456' }, 'x');
  ok(r.status === 409, 'e-mail duplicado bloqueado (case-insensitive)');
  r = await call('POST', '/api/signup', { name: 'X', email: 'x@teste.com', password: '123' }, 'x');
  ok(r.status === 400, 'senha curta bloqueada');
  r = await call('POST', '/api/login', { email: 'ana@teste.com', password: 'errada' }, 'x');
  ok(r.status === 401, 'senha errada recusada');
  r = await call('POST', '/api/login', { email: 'ana@teste.com', password: '123456' }, 'ana');
  ok(r.status === 200, 'login do usuário');
  r = await call('GET', '/api/me', null, 'ana');
  ok(r.data.user && r.data.user.email === 'ana@teste.com', '/api/me identifica a sessão');
  r = await call('GET', '/api/me', null, 'anon');
  ok(r.data.user === null, 'sem cookie => sem usuário');

  // Time fixo da Ana: Vasco
  r = await call('PUT', '/api/me/team', { teamId: 'vasco' }, 'ana');
  ok(r.status === 200 && r.data.user.favoriteTeamId === 'vasco', 'time fixo da Ana');

  // Admin account (special) via env
  r = await call('POST', '/api/login', { email: 'admin@arquibancada.local', password: 'senha-admin-teste' }, 'admin');
  ok(r.status === 200 && r.data.user.role === 'admin', 'login do admin com senha do ambiente');

  // Permissions
  r = await call('GET', '/api/admin/users', null, 'ana');
  ok(r.status === 403, 'usuário comum não acessa painel admin');
  r = await call('GET', '/api/admin/users', null, 'anon');
  ok(r.status === 401, 'anônimo não acessa painel admin');
  r = await call('GET', '/api/admin/users', null, 'admin');
  ok(r.status === 200 && r.data.users.length >= 2, 'admin lista usuários');

  // Jogos: usuários comuns só veem jogos que ainda vão acontecer
  const gamesAdmin = (await call('GET', '/api/games', null, 'admin')).data.games;
  ok(gamesAdmin.length >= 10, 'admin vê os jogos da rodada criada no futuro');
  const pastGame = gamesAdmin.find((x) => x.id === 'flamengo-fluminense');
  r = await call('PUT', `/api/admin/games/${pastGame.id}`, { homeId: 'flamengo', awayId: 'fluminense', date: '2020-01-01', time: '10:00', onSite: true }, 'admin');
  ok(r.status === 200 && r.data.game.date === '2020-01-01', 'admin move jogo para o passado');
  const anonGames = (await call('GET', '/api/games?teamId=flamengo')).data.games;
  ok(!anonGames.some((x) => x.id === 'flamengo-fluminense'), 'visitante não vê jogo que já passou');
  r = await call('PUT', `/api/admin/games/${pastGame.id}`, { homeId: 'flamengo', awayId: 'fluminense', date: '2030-06-01', time: '20:00', onSite: true }, 'admin');
  ok(r.status === 200, 'admin devolve o jogo para o futuro');

  // Bets — jogo do time fixo da Ana: Botafogo x Vasco
  const games = (await call('GET', '/api/games', null, 'ana')).data.games;
  const g = games.find((x) => x.id === 'botafogo-vasco');
  ok(Boolean(g), 'usuário vê o jogo futuro do time fixo (Botafogo x Vasco)');
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 1, guessAway: 3, scorers: ['Nuno'] }, 'anon');
  ok(r.status === 401, 'palpite sem login recusado');
  r = await call('POST', '/api/bets', { gameId: 'flamengo-fluminense', guessHome: 2, guessAway: 1, scorers: ['Pedro'] }, 'ana');
  ok(r.status === 403, 'partida fora do time fixo recusada');
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 99, guessAway: 1, scorers: ['Nuno'] }, 'ana');
  ok(r.status === 400, 'placar acima do limite recusado');
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 2, guessAway: -1, scorers: ['Nuno'] }, 'ana');
  ok(r.status === 400, 'placar negativo recusado');
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 2, guessAway: 1, scorers: [] }, 'ana');
  ok(r.status === 400, 'palpite sem artilheiro recusado');
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 1, guessAway: 3, scorers: ['Nuno', 'nuno', ' Nuno  ', 'David'] }, 'ana');
  ok(r.status === 201 && r.data.bet.scorers.length === 2, 'artilheiro repetido (caixa/espaco) deduplicado');
  ok(r.data.bet.guessHome === 1 && r.data.bet.guessAway === 3, 'palpite criado com o placar informado');
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 1, guessAway: 3, scorers: ['Nuno', 'David'] }, 'ana');
  ok(r.status === 200 && r.data.bet.scorers.length === 2, 'palpite reenviado atualiza o anterior (editável até fechar)');

  // Bia acerta só o resultado (palpita 1x2) e acerta o artilheiro Arthur Cabral
  r = await call('POST', '/api/signup', { name: 'Bia Silva', email: 'biasilva@teste.com', password: '123456' }, 'bia2');
  ok(r.status === 201, 'cadastro da Bia');
  await call('PUT', '/api/me/team', { teamId: 'vasco' }, 'bia2');
  await call('POST', '/api/bets', { gameId: g.id, guessHome: 1, guessAway: 2, scorers: ['Arthur Cabral'] }, 'bia2');

  // Caio errou tudo (palpita vitória do Botafogo)
  await call('POST', '/api/signup', { name: 'Caio', email: 'caio@teste.com', password: '123456' }, 'caio');
  await call('PUT', '/api/me/team', { teamId: 'vasco' }, 'caio');
  await call('POST', '/api/bets', { gameId: g.id, guessHome: 2, guessAway: 0, scorers: ['Léo Jardim'] }, 'caio');

  // Admin registra: Botafogo 1 x 3 Vasco, gols de Nuno e David (Vasco) e Arthur Cabral (Botafogo)
  r = await call('PUT', `/api/admin/games/${g.id}`, { homeId: 'botafogo', awayId: 'vasco', date: g.date, time: '21:00',
    winnerId: 'vasco', homeGoals: 1, awayGoals: 3, scorersHome: 'Arthur Cabral', scorersAway: 'Nuno, david' }, 'admin');
  ok(r.status === 200 && r.data.game.winnerId === 'vasco', 'admin registra placar; vencedor confere');
  r = await call('PUT', `/api/admin/games/${g.id}`, { homeId: 'botafogo', awayId: 'vasco', date: g.date, time: '21:00',
    winnerId: 'botafogo', homeGoals: 1, awayGoals: 3, scorersHome: '', scorersAway: '' }, 'admin');
  ok(r.status === 400, 'vencedor divergente do placar recusado');

  r = await call('GET', '/api/bets', null, 'ana');
  const mine = r.data.bets.find((b) => b.matchId === g.id);
  ok(mine && mine.status.kind === 'exact' && mine.status.label === 'PLACAR EXATO', 'placar 1x3 exato marcado como PLACAR EXATO');
  ok(mine && mine.points === 5, 'pontos da Ana: 3 (placar) + 2 (Nuno e David) = 5 => ' + (mine && mine.points));
  ok(mine && mine.resultText.includes('1 x 3'), 'texto do resultado: ' + (mine && mine.resultText));

  r = await call('GET', '/api/bets', null, 'bia2');
  const biaBet = r.data.bets.find((b) => b.matchId === g.id);
  ok(biaBet && biaBet.status.kind === 'outcome' && biaBet.status.label === 'ACERTOU O RESULTADO', '1x2 acerta só o resultado (Vasco venceu)');
  ok(biaBet && biaBet.points === 2, 'pontos da Bia: 1 (resultado) + 1 (Arthur Cabral marcou) => ' + (biaBet && biaBet.points));

  r = await call('GET', '/api/bets', null, 'caio');
  const caioBet = r.data.bets.find((b) => b.matchId === g.id);
  ok(caioBet && caioBet.status.kind === 'lost' && caioBet.points === 0, '2x0 (resultado errado) = 0 ponto');

  // Ranking considera os palpites novos
  r = await call('GET', '/api/ranking');
  const anaRow = r.data.ranking.find((row) => row.name === 'Ana');
  ok(anaRow && anaRow.points === 5 && anaRow.exactHits === 1, 'ranking da Ana: 5 pontos, 1 placar exato');
  ok(r.data.rules && r.data.rules.exact === 3 && r.data.rules.outcome === 1 && r.data.rules.scorer === 1, 'regras do ranking expostas na API');

  r = await call('GET', '/api/admin/bets', null, 'admin');
  ok(r.status === 200 && r.data.bets.some((b) => b.user.email === 'ana@teste.com'), 'admin vê palpites com nome e e-mail do usuário');

  // Closed game refuses new bets
  r = await call('POST', '/api/bets', { gameId: g.id, guessHome: 1, guessAway: 1, scorers: ['Keno'] }, 'x');
  ok(r.status === 401 || r.status === 409, 'partida encerrada não aceita palpites');

  // Admin edits teams of a game with bets => locked
  r = await call('PUT', `/api/admin/games/${g.id}`, { homeId: 'santos', awayId: 'vasco', date: g.date, time: g.time }, 'admin');
  ok(r.status === 200 && r.data.game.homeId === 'botafogo', 'times travados após o primeiro palpite');

  // Admin creates a game
  r = await call('POST', '/api/admin/games', {}, 'admin');
  ok(r.status === 201 && r.data.game.id.startsWith('admin-game-'), 'admin cria jogo');

  // Logout
  r = await call('POST', '/api/logout', null, 'ana');
  r = await call('GET', '/api/bets', null, 'ana');
  ok(r.status === 401, 'após logout, sessão antiga não funciona');

  // Brute force limit
  let last;
  for (let i = 0; i < 11; i++) last = await call('POST', '/api/login', { email: 'ana@teste.com', password: 'x' + i }, 'bf');
  ok(last.status === 429, 'login bloqueado após 10 tentativas erradas');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
