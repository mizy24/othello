const boardEl = document.getElementById('board')
const infoEl = document.getElementById('info')
const startBtn = document.getElementById('start-btn')
const opponentSelect = document.getElementById('opponent-select')
const simsInput = document.getElementById('sims')
const noteEl = document.getElementById('note')
const passBtn = document.getElementById('pass-btn')
const backendUrlInput = document.getElementById('backend-url')

const PASS_ACTION = 64

let currentState = null
let waiting = false

function getBackendUrl() {
  return (backendUrlInput.value || 'http://localhost:5000').replace(/\/$/, '')
}

function buildBoard(board, legal) {
  boardEl.innerHTML = ''
  // Ensure board is a 2D 8x8 array
  let b = board
  if (!b || !Array.isArray(b) || b.length !== 8) {
    b = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0))
  }
  const legalMoves = Array.isArray(legal) ? legal : []
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const idx = r * 8 + c
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.dataset.idx = idx
      if (legalMoves.includes(idx)) cell.classList.add('legal')

      const val = (b[r] && typeof b[r][c] !== 'undefined') ? b[r][c] : 0
      if (val === 1) {
        const p = document.createElement('div')
        p.className = 'piece black'
        cell.appendChild(p)
      } else if (val === -1) {
        const p = document.createElement('div')
        p.className = 'piece white'
        cell.appendChild(p)
      }

      cell.addEventListener('click', onCellClick)
      boardEl.appendChild(cell)
    }
  }
}

function renderLocalMove(idx) {
  // Optimistically show the human's move locally
  if (!currentState) return
  // ensure board exists
  if (!currentState.board || !Array.isArray(currentState.board) || currentState.board.length !== 8) {
    currentState.board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0))
  }
  const row = Math.floor(idx / 8)
  const col = idx % 8
  const player = currentState.current_player === 1 ? 1 : -1
  currentState.board[row][col] = player
  // after move, remove legal moves locally to avoid double clicks
  currentState.legal_moves = []
  buildBoard(currentState.board, currentState.legal_moves)
}

async function startGame() {
  const opp = opponentSelect.value
  const sims = parseInt(simsInput.value || '80', 10)
  noteEl.textContent = ''
  const backendUrl = getBackendUrl()
  try {
    const res = await fetch(`${backendUrl}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opponent: opp, sims }) })
    const j = await res.json()
    if (j.error) {
      noteEl.textContent = j.error
      return
    }
    renderState(j)
  } catch (e) {
    noteEl.textContent = '后端连接失败: ' + e.message
  }
}

function renderState(s) {
  currentState = s
  waiting = false
  buildBoard(s.board, s.legal_moves)
  let info = `当前执子: ${s.current_player === 1 ? '黑' : '白'}`
  if (s.game_over) {
    let winnerText = '平局'
    if (s.winner === 1) winnerText = '黑方胜'
    else if (s.winner === -1) winnerText = '白方胜'
    info += ` (已结束) - ${winnerText} | 黑:${s.black_count} 白:${s.white_count}`
  }
  infoEl.textContent = info
  // if game over, prevent further moves
  if (s.game_over) {
    passBtn.style.display = 'none'
  }
  // Show pass button when only legal move is pass
  if (s.legal_moves && s.legal_moves.length === 1 && s.legal_moves[0] === PASS_ACTION && !s.game_over) {
    passBtn.style.display = 'inline-block'
    // Auto-pass after short delay so the game doesn't stall (useful for human vs AI)
    setTimeout(() => {
      // double-check current state to avoid race
      const backendUrl = getBackendUrl()
      fetch(`${backendUrl}/state`).then(r => r.json()).then(curr => {
        if (curr.legal_moves && curr.legal_moves.length === 1 && curr.legal_moves[0] === PASS_ACTION && !curr.game_over) {
          // perform automated pass only if not already waiting for a move
          if (!waiting) onPass()
        }
      }).catch(() => {})
    }, 500)
  } else {
    if (!s.game_over) passBtn.style.display = 'none'
  }
}

async function onCellClick(e) {
  if (waiting) return
  const idx = parseInt(e.currentTarget.dataset.idx, 10)
  if (!currentState) return
  const legal = currentState.legal_moves || []
  if (!legal.includes(idx)) {
    noteEl.textContent = '非法落子'
    return
  }

  // Optimistically render human move immediately
  renderLocalMove(idx)
  waiting = true

  const backendUrl = getBackendUrl()
  try {
    const res = await fetch(`${backendUrl}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: idx }) })
    const j = await res.json()
    if (j.error) {
      noteEl.textContent = j.error
      // refresh authoritative state
      fetch(`${backendUrl}/state`).then(r => r.json()).then(renderState)
      return
    }
    if (j.after_human) renderState(j.after_human)
    if (j.after_opponent) renderState(j.after_opponent)
  } catch (e) {
    noteEl.textContent = '请求失败: ' + e.message
  } finally {
    waiting = false
  }
}

async function onPass() {
  if (waiting) return
  waiting = true
  passBtn.disabled = true
  const backendUrl = getBackendUrl()
  try {
    const res = await fetch(`${backendUrl}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: PASS_ACTION }) })
    const j = await res.json()
    if (j.error) {
      noteEl.textContent = j.error
      // refresh authoritative state
      fetch(`${backendUrl}/state`).then(r => r.json()).then(renderState)
      return
    }
    if (j.after_human) renderState(j.after_human)
    if (j.after_opponent) renderState(j.after_opponent)
  } catch (e) {
    noteEl.textContent = '请求失败: ' + e.message
  } finally {
    waiting = false
    passBtn.disabled = false
  }
}

passBtn.addEventListener('click', onPass)

startBtn.addEventListener('click', startGame)

// Initialize: draw empty board immediately
console.log('[app.js] drawing initial empty board')
buildBoard(Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)), [])

// load initial blank
const backendUrl = getBackendUrl()
console.log('[app.js] initialized, backend URL:', backendUrl)
// try to load state, but don't fail if backend unavailable
setTimeout(() => {
  fetch(`${backendUrl}/state`).then(r => r.json()).then(renderState).catch(e => {
    console.error('[app.js] failed to load initial state:', e)
    noteEl.textContent = '无法连接到后端: ' + e.message
  })
}, 100)
