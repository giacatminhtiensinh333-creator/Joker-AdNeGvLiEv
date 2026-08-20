const PLAYER_COUNT = 7;
const HUMAN_ID = 0;
const NORMAL_DELAY = 900;

const startBtn = document.getElementById('startBtn');
const seatContainer = document.getElementById('seatContainer');
const humanHandEl = document.getElementById('humanHand');
const phaseText = document.getElementById('phaseText');
const turnText = document.getElementById('turnText');
const logEl = document.getElementById('log');
const tableEl = document.getElementById('table');

let game = null;

startBtn.addEventListener('click', () => startGame());

function startGame() {
  game = {
    players: [],
    current: 0,
    waitingForHumanPick: false,
    pendingResolve: null,
    isBusy: false,
    armageddon: {
      active: false,
      turnsLeft: 0,
    },
    ended: false,
  };

  initializePlayers();
  const deck = createDeck();
  shuffle(deck);
  deal(deck);

  for (const p of game.players) {
    autoDiscardPairs(p, true);
  }

  logEl.innerHTML = '';
  log(`Đã phát bài: 49 lá / 7 người (mỗi người 7 lá).`);
  render();
  updatePhaseText();
  nextTurnTick(450);
}

function initializePlayers() {
  const names = ['Bạn', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4', 'Bot 5', 'Bot 6'];
  game.players = Array.from({ length: PLAYER_COUNT }, (_, i) => ({
    id: i,
    name: names[i],
    isHuman: i === HUMAN_ID,
    hand: [],
    eliminated: false,
    discardedPairs: 0,
  }));
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ id: `${r}${s}`, rank: r, suit: s, isJoker: false });
    }
  }

  deck.push({ id: 'JOKER', rank: 'JOKER', suit: '', isJoker: true });
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function deal(deck) {
  for (let i = 0; i < PLAYER_COUNT; i++) {
    for (let j = 0; j < 7; j++) {
      game.players[i].hand.push(deck.pop());
    }
  }
}

function autoDiscardPairs(player, silent = false) {
  const byRank = new Map();
  for (const card of player.hand) {
    if (card.isJoker) continue;
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(card);
  }

  let removed = 0;
  for (const [_, cards] of byRank.entries()) {
    const pairCount = Math.floor(cards.length / 2);
    for (let i = 0; i < pairCount * 2; i++) {
      const idx = player.hand.findIndex((c) => c.id === cards[i].id);
      if (idx >= 0) {
        player.hand.splice(idx, 1);
        removed++;
      }
    }
  }

  if (removed > 0) {
    const pairs = removed / 2;
    player.discardedPairs += pairs;
    if (!silent) log(`${player.name} hạ ${pairs} đôi.`);
  }
}

function getActivePlayers() {
  return game.players.filter((p) => !p.eliminated);
}

function getNextActiveIndex(fromIndex) {
  for (let step = 1; step <= PLAYER_COUNT; step++) {
    const idx = (fromIndex + step) % PLAYER_COUNT;
    if (!game.players[idx].eliminated) return idx;
  }
  return fromIndex;
}

function getPrevActiveIndex(fromIndex) {
  for (let step = 1; step <= PLAYER_COUNT; step++) {
    const idx = (fromIndex - step + PLAYER_COUNT) % PLAYER_COUNT;
    if (!game.players[idx].eliminated) return idx;
  }
  return fromIndex;
}

function updatePhaseText() {
  if (game.ended) return;
  if (game.armageddon.active) {
    phaseText.textContent = `⚠️ Armageddon đang diễn ra! Còn ${game.armageddon.turnsLeft} lượt.`;
  } else {
    phaseText.textContent = 'Giai đoạn thường: hết bài sẽ bị loại, và rút được Joker từ người khác sẽ khiến họ bị loại.';
  }
}

function nextTurnTick(delay = NORMAL_DELAY) {
  if (game.ended) return;
  setTimeout(runTurn, delay);
}

async function runTurn() {
  if (game.ended || game.isBusy) return;

  const active = getActivePlayers();
  if (active.length === 1) {
    endGame(active[0], 'Chỉ còn 1 người chơi còn sống.');
    return;
  }

  const currentPlayer = game.players[game.current];
  if (currentPlayer.eliminated) {
    game.current = getNextActiveIndex(game.current);
    nextTurnTick(120);
    return;
  }

  const targetIndex = getNextActiveIndex(game.current);
  const targetPlayer = game.players[targetIndex];

  turnText.textContent = `Lượt: ${currentPlayer.name} bốc 1 lá từ ${targetPlayer.name}`;
  render();

  if (targetPlayer.hand.length === 0) {
    game.current = targetIndex;
    nextTurnTick(200);
    return;
  }

  if (currentPlayer.isHuman) {
    game.waitingForHumanPick = true;
    log('Đến lượt bạn: chọn một lá úp của người kế bên để bốc.');
    render();
    return;
  }

  game.isBusy = true;
  const pick = Math.floor(Math.random() * targetPlayer.hand.length);
  await resolveDraw(game.current, targetIndex, pick);
  game.isBusy = false;

  if (!game.ended) {
    game.current = getNextActiveIndex(game.current);
    nextTurnTick();
  }
}

async function onHumanPick(cardIndex) {
  if (!game || game.ended || !game.waitingForHumanPick || game.isBusy) return;
  const currentPlayer = game.players[game.current];
  const targetIndex = getNextActiveIndex(game.current);
  const target = game.players[targetIndex];

  if (!currentPlayer.isHuman || target.eliminated) return;
  if (cardIndex < 0 || cardIndex >= target.hand.length) return;

  game.waitingForHumanPick = false;
  game.isBusy = true;
  await resolveDraw(game.current, targetIndex, cardIndex);
  game.isBusy = false;

  if (!game.ended) {
    game.current = getNextActiveIndex(game.current);
    nextTurnTick();
  }
}

async function resolveDraw(drawerIndex, targetIndex, pickIndex) {
  const drawer = game.players[drawerIndex];
  const target = game.players[targetIndex];
  if (drawer.eliminated || target.eliminated || target.hand.length === 0) return;

  await animateDraw(drawerIndex, targetIndex);
  const [card] = target.hand.splice(pickIndex, 1);
  drawer.hand.push(card);
  log(`${drawer.name} bốc 1 lá từ ${target.name}.`);

  const isJokerDrawn = card?.isJoker;

  if (!game.armageddon.active && isJokerDrawn) {
    target.eliminated = true;
    log(`💥 ${target.name} bị bốc mất Joker và lập tức bị loại!`);
    redistributeCards(target.id);
  }

  autoDiscardPairs(drawer);

  if (!game.armageddon.active) {
    eliminateZeroHandPlayers();
  } else {
    if (checkArmageddonEmptyHandWin()) {
      render();
      return;
    }
  }

  maybeStartArmageddon();

  if (game.armageddon.active && !game.ended) {
    game.armageddon.turnsLeft -= 1;
    updatePhaseText();
    if (game.armageddon.turnsLeft <= 0) {
      resolveArmageddonByJoker();
    }
  }

  render();
}

function eliminateZeroHandPlayers() {
  for (const p of game.players) {
    if (!p.eliminated && p.hand.length === 0) {
      p.eliminated = true;
      log(`${p.name} đã hết bài và bị loại.`);
    }
  }
}

function redistributeCards(eliminatedPlayerId) {
  const eliminated = game.players[eliminatedPlayerId];
  const leftovers = eliminated.hand.splice(0);
  if (leftovers.length === 0) return;

  const receivers = getActivePlayers().filter((p) => p.id !== eliminatedPlayerId);
  if (receivers.length === 0) return;

  let idx = 0;
  for (const c of leftovers) {
    receivers[idx % receivers.length].hand.push(c);
    idx++;
  }
  log(`Chia ${leftovers.length} lá còn lại của ${eliminated.name} cho người chơi còn sống.`);

  for (const p of receivers) autoDiscardPairs(p);
}

function maybeStartArmageddon() {
  if (game.armageddon.active || game.ended) return;
  const active = getActivePlayers();
  if (active.length !== 2) return;

  game.armageddon.active = true;
  game.armageddon.turnsLeft = 10;
  tableEl.classList.add('armageddon');
  log('☠️ Kích hoạt Armageddon: 2 người chơi đấu 10 lượt sinh tử!');
  updatePhaseText();
}

function checkArmageddonEmptyHandWin() {
  if (!game.armageddon.active) return false;
  const active = getActivePlayers();
  if (active.length !== 2) return false;

  const winner = active.find((p) => p.hand.length === 0);
  if (winner) {
    endGame(winner, `${winner.name} hết bài trong Armageddon và thắng ngay.`);
    return true;
  }
  return false;
}

function resolveArmageddonByJoker() {
  if (!game.armageddon.active || game.ended) return;
  const active = getActivePlayers();
  const jokerHolder = active.find((p) => p.hand.some((c) => c.isJoker));

  if (!jokerHolder) {
    endGame(active[0], 'Không ai giữ Joker sau 10 lượt (trường hợp hiếm), người đang lượt được xét thắng.');
    return;
  }

  const winner = active.find((p) => p.id !== jokerHolder.id);
  endGame(winner, `${jokerHolder.name} giữ Joker sau 10 lượt Armageddon và thua.`);
}

function endGame(winner, reason) {
  game.ended = true;
  game.waitingForHumanPick = false;
  game.isBusy = false;
  phaseText.textContent = `🏁 Kết thúc: ${winner.name} chiến thắng!`;
  turnText.textContent = reason;
  log(`🏆 ${winner.name} chiến thắng. Lý do: ${reason}`);
  render();
}

function render() {
  renderSeats();
  renderHumanHand();
  updatePhaseText();
}

function renderSeats() {
  seatContainer.innerHTML = '';
  const centerX = 50;
  const centerY = 50;
  const radius = 38;

  game.players.forEach((p, idx) => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / PLAYER_COUNT;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const seat = document.createElement('div');
    seat.className = 'seat';
    if (p.eliminated) seat.classList.add('eliminated');
    if (idx === game.current && !game.ended) seat.classList.add('current');
    seat.style.left = `${x}%`;
    seat.style.top = `${y}%`;

    const isHumanTarget =
      game.waitingForHumanPick &&
      !game.ended &&
      getNextActiveIndex(game.current) === p.id &&
      !p.eliminated;

    const cardsHtml = p.hand
      .map((_, cardIdx) => {
        if (p.isHuman) return '<div class="card-back" title="Bài của bạn hiển thị bên dưới"></div>';
        const selectable = isHumanTarget ? 'selectable' : '';
        return `<div class="card-back ${selectable}" data-target="${p.id}" data-idx="${cardIdx}"></div>`;
      })
      .join('');

    seat.innerHTML = `
      <div class="player-name">${p.name}</div>
      <div class="player-meta">${p.eliminated ? 'Đã loại' : `Còn ${p.hand.length} lá · Đôi: ${p.discardedPairs}`}</div>
      <div class="card-row">${cardsHtml || '<em>(trống)</em>'}</div>
    `;

    seatContainer.appendChild(seat);
  });

  seatContainer.querySelectorAll('.card-back.selectable').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      onHumanPick(idx);
    });
  });
}

function renderHumanHand() {
  const human = game.players[HUMAN_ID];
  humanHandEl.innerHTML = '';

  for (const c of human.hand) {
    const el = document.createElement('div');
    el.className = 'card-front';
    el.textContent = c.isJoker ? '🃏' : `${c.rank}${c.suit}`;
    humanHandEl.appendChild(el);
  }
}

async function animateDraw(drawerIndex, targetIndex) {
  const seats = [...document.querySelectorAll('.seat')];
  const targetSeat = seats[targetIndex];
  const drawerSeat = seats[drawerIndex];
  if (!targetSeat || !drawerSeat) return;

  const tableRect = tableEl.getBoundingClientRect();
  const fromRect = targetSeat.getBoundingClientRect();
  const toRect = drawerSeat.getBoundingClientRect();

  const card = document.createElement('div');
  card.className = 'fly-card';
  card.style.left = `${fromRect.left - tableRect.left + fromRect.width / 2}px`;
  card.style.top = `${fromRect.top - tableRect.top + fromRect.height / 2}px`;
  tableEl.querySelector('.animation-layer').appendChild(card);

  await wait(30);
  card.style.left = `${toRect.left - tableRect.left + toRect.width / 2}px`;
  card.style.top = `${toRect.top - tableRect.top + toRect.height / 2}px`;

  await wait(470);
  card.style.opacity = '0';
  await wait(160);
  card.remove();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  const p = document.createElement('p');
  p.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  logEl.prepend(p);
}
