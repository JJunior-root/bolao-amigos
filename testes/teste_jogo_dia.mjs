const B = 'http://localhost:3300';
const jar = {};
async function call(method, path, body, who = 'anon') {
  const h = { 'Content-Type': 'application/json' }; if (jar[who]) h.Cookie = jar[who];
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fails++; };
(async () => {
  await call('POST', '/api/login', { email: 'admin@arquibancada.local', password: 'senha-admin-teste' }, 'admin');
  await call('POST', '/api/signup', { name: 'Bia', email: 'bia@teste.com', password: '123456' }, 'bia');
  let all = (await call('GET', '/api/games', null, 'admin')).data.games;
  const target = all[0];
  // Admin hides one game
  let r = await call('PUT', `/api/admin/games/${target.id}`, { homeId: target.homeId, awayId: target.awayId, date: target.date, time: target.time, onSite: false }, 'admin');
  ok(r.status === 200 && r.data.game.onSite === false, 'admin marca jogo como oculto');
  const guest = (await call('GET', '/api/games')).data.games;
  ok(!guest.some((g) => g.id === target.id), 'visitante não vê o jogo oculto');
  const bia = (await call('GET', '/api/games', null, 'bia')).data.games;
  ok(!bia.some((g) => g.id === target.id), 'usuário comum não vê o jogo oculto');
  const adminView = (await call('GET', '/api/games', null, 'admin')).data.games;
  ok(adminView.some((g) => g.id === target.id), 'admin continua vendo o jogo oculto');
  r = await call('POST', '/api/bets', { gameId: target.id, guessHome: 1, guessAway: 0, scorers: ['Alguém'] }, 'bia');
  ok(r.status === 404, 'palpite em jogo oculto é recusado para usuário');
  // Admin shows it again
  r = await call('PUT', `/api/admin/games/${target.id}`, { homeId: target.homeId, awayId: target.awayId, date: target.date, time: target.time, onSite: true }, 'admin');
  const again = (await call('GET', '/api/games')).data.games;
  ok(again.some((g) => g.id === target.id), 'admin marca o jogo e ele aparece para todos');
  // Saving without onSite keeps current value
  r = await call('PUT', `/api/admin/games/${target.id}`, { homeId: target.homeId, awayId: target.awayId, date: target.date, time: '20:15' }, 'admin');
  ok(r.data.game.onSite === true && r.data.game.time === '20:15', 'salvar sem mexer na marcação preserva o valor');
  // New game is created hidden
  r = await call('POST', '/api/admin/games', {}, 'admin');
  ok(r.data.game.onSite === false, 'jogo criado pelo admin começa oculto');
  // Non-admin cannot use admin routes
  r = await call('PUT', `/api/admin/games/${target.id}`, { homeId: target.homeId, awayId: target.awayId, date: target.date, time: target.time, onSite: false }, 'bia');
  ok(r.status === 403, 'usuário comum não consegue ocultar jogo');
  console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes do jogo do dia passaram.');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
