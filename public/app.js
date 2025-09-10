// Global state
let state = {
    auth: null,
    selectedRoom: null,
    selectedSlot: null,
    holdToken: null,
    holdExpiry: null
};

// API Base URL - will be relative in production
const API_BASE = '';

// Utility functions
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Auth functions
function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const authStatus = document.getElementById('authStatus');
    const myReservationsSection = document.getElementById('myReservationsSection');
    
    if (state.auth) {
        authStatus.textContent = `${state.auth.phone} 로그인됨`;
        authBtn.textContent = '로그아웃';
        authBtn.onclick = logout;
        loadMyReservations();
    } else {
        authStatus.textContent = '로그인하여 예약 관리';
        authBtn.textContent = '로그인';
        authBtn.onclick = showLoginModal;
        myReservationsSection.classList.add('hidden');
    }
}

function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
}

function hideLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginForm').reset();
}

async function login(e) {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        // Test authentication by fetching reservations
        const response = await fetch(`${API_BASE}/reservations?phone=${phone}&password=${password}`);
        
        if (response.ok) {
            state.auth = { phone, password };
            localStorage.setItem('auth', JSON.stringify(state.auth));
            hideLoginModal();
            updateAuthUI();
            showToast('로그인 성공');
        } else {
            showToast('로그인 실패: 전화번호 또는 비밀번호를 확인하세요', 'error');
        }
    } catch (error) {
        showToast('로그인 중 오류 발생', 'error');
    }
}

function logout() {
    state.auth = null;
    localStorage.removeItem('auth');
    updateAuthUI();
    showToast('로그아웃되었습니다');
}

// Room search
async function searchRooms() {
    const date = document.getElementById('searchDate').value;
    const startTime = document.getElementById('searchStartTime').value;
    const endTime = document.getElementById('searchEndTime').value;
    const capacity = document.getElementById('searchCapacity').value;
    const location = document.getElementById('searchLocation').value;
    
    if (!date || !startTime || !endTime) {
        showToast('날짜와 시간을 입력하세요', 'error');
        return;
    }
    
    // Create local date/time and convert to UTC
    const startDate = new Date(`${date}T${startTime}:00`);
    const endDate = new Date(`${date}T${endTime}:00`);
    
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    
    const params = new URLSearchParams({
        start,
        end,
        ...(capacity && { capacity }),
        ...(location && { location })
    });
    
    try {
        const response = await fetch(`${API_BASE}/rooms/availability?${params}`);
        const data = await response.json();
        
        if (response.ok) {
            displayRooms(data.rooms);
        } else {
            showToast(data.message || '검색 실패', 'error');
        }
    } catch (error) {
        showToast('검색 중 오류 발생', 'error');
    }
}

function displayRooms(rooms) {
    const roomsSection = document.getElementById('roomsSection');
    const roomsList = document.getElementById('roomsList');
    
    if (rooms.length === 0) {
        roomsList.innerHTML = '<p>가용한 회의실이 없습니다.</p>';
    } else {
        roomsList.innerHTML = rooms.map(room => `
            <div class="room-card" data-room-id="${room.id}" onclick="selectRoom(${room.id}, '${room.name}')">
                <div class="room-name">${room.name}</div>
                <div class="room-info">
                    <span>📍 ${room.location}</span>
                    <span>👥 ${room.capacity}명</span>
                    <span>⏰ ${room.open_time.slice(0,5)}-${room.close_time.slice(0,5)}</span>
                </div>
            </div>
        `).join('');
    }
    
    roomsSection.classList.remove('hidden');
}

function selectRoom(roomId, roomName) {
    // Update UI
    document.querySelectorAll('.room-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-room-id="${roomId}"]`).classList.add('selected');
    
    // Update state
    state.selectedRoom = { id: roomId, name: roomName };
    
    // Show slots section
    document.getElementById('slotsSection').classList.remove('hidden');
    
    showToast(`${roomName} 선택됨`);
}

// Time slots
async function generateSlots() {
    if (!state.selectedRoom) {
        showToast('먼저 회의실을 선택하세요', 'error');
        return;
    }
    
    const date = document.getElementById('searchDate').value;
    const startTime = document.getElementById('searchStartTime').value;
    const endTime = document.getElementById('searchEndTime').value;
    const duration = document.getElementById('duration').value;
    
    // Create local date/time and convert to UTC
    const startDate = new Date(`${date}T${startTime}:00`);
    const endDate = new Date(`${date}T${endTime}:00`);
    
    const params = new URLSearchParams({
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        stepMinutes: duration,
        durationMinutes: duration,
        bufferMinutes: 0
    });
    
    try {
        const response = await fetch(`${API_BASE}/rooms/${state.selectedRoom.id}/slots?${params}`);
        const data = await response.json();
        
        if (response.ok) {
            displaySlots(data.slots);
        } else {
            showToast(data.message || '시간대 생성 실패', 'error');
        }
    } catch (error) {
        showToast('시간대 생성 중 오류 발생', 'error');
    }
}

function displaySlots(slots) {
    const slotsList = document.getElementById('slotsList');
    
    if (slots.length === 0) {
        slotsList.innerHTML = '<p>가용한 시간대가 없습니다.</p>';
    } else {
        slotsList.innerHTML = slots.map(slot => `
            <button 
                class="slot-btn" 
                onclick="selectSlot('${slot.start}', '${slot.end}')"
            >
                ${formatTime(slot.start)}<br>~<br>${formatTime(slot.end)}
            </button>
        `).join('');
    }
}

async function selectSlot(start, end) {
    if (!state.selectedRoom) return;
    
    // Create hold
    try {
        const response = await fetch(`${API_BASE}/holds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: state.selectedRoom.id,
                start,
                end,
                ttlSeconds: 300 // 5 minutes
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            state.selectedSlot = { start, end };
            state.holdToken = data.holdToken;
            state.holdExpiry = data.expiresAt;
            
            showConfirmSection();
            showToast('시간대가 선택되었습니다. 5분 내에 예약을 완료하세요.', 'warning');
        } else {
            showToast(data.message || '시간대 선택 실패', 'error');
        }
    } catch (error) {
        showToast('시간대 선택 중 오류 발생', 'error');
    }
}

function showConfirmSection() {
    document.getElementById('selectedRoom').textContent = state.selectedRoom.name;
    document.getElementById('selectedTime').textContent = 
        `${formatDateTime(state.selectedSlot.start)} ~ ${formatTime(state.selectedSlot.end)}`;
    document.getElementById('holdExpiry').textContent = formatTime(state.holdExpiry);
    
    document.getElementById('confirmSection').classList.remove('hidden');
    
    // Start countdown
    const interval = setInterval(() => {
        const remaining = new Date(state.holdExpiry) - new Date();
        if (remaining <= 0) {
            clearInterval(interval);
            showToast('홀드가 만료되었습니다. 다시 선택해주세요.', 'error');
            document.getElementById('confirmSection').classList.add('hidden');
            state.holdToken = null;
            state.holdExpiry = null;
        }
    }, 1000);
}

// Confirm reservation
async function confirmReservation(e) {
    e.preventDefault();
    
    if (!state.holdToken) {
        showToast('홀드가 만료되었습니다', 'error');
        return;
    }
    
    const reserverName = document.getElementById('reserverName').value;
    const phone = document.getElementById('phone').value;
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('passwordConfirm').value;
    
    if (password !== passwordConfirm) {
        showToast('비밀번호가 일치하지 않습니다', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/reservations/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holdToken: state.holdToken,
                reserverName,
                phone,
                password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('예약이 확정되었습니다!', 'success');
            
            // Auto-login
            state.auth = { phone, password };
            localStorage.setItem('auth', JSON.stringify(state.auth));
            updateAuthUI();
            
            // Reset form
            document.getElementById('confirmForm').reset();
            document.getElementById('confirmSection').classList.add('hidden');
            
            // Clear state
            state.selectedRoom = null;
            state.selectedSlot = null;
            state.holdToken = null;
            state.holdExpiry = null;
        } else {
            showToast(data.message || '예약 확정 실패', 'error');
        }
    } catch (error) {
        showToast('예약 확정 중 오류 발생', 'error');
    }
}

// My reservations
async function loadMyReservations() {
    if (!state.auth) return;
    
    try {
        const params = new URLSearchParams({
            phone: state.auth.phone,
            password: state.auth.password
        });
        
        const response = await fetch(`${API_BASE}/reservations?${params}`);
        const data = await response.json();
        
        if (response.ok) {
            displayMyReservations(data.reservations);
        } else {
            showToast('예약 조회 실패', 'error');
        }
    } catch (error) {
        showToast('예약 조회 중 오류 발생', 'error');
    }
}

function displayMyReservations(reservations) {
    const section = document.getElementById('myReservationsSection');
    const list = document.getElementById('reservationsList');
    
    if (reservations.length === 0) {
        list.innerHTML = '<p>예약 내역이 없습니다.</p>';
    } else {
        list.innerHTML = reservations.map(r => {
            const start = new Date(r.period.lower);
            const end = new Date(r.period.upper);
            const canCancel = start > new Date();
            
            return `
                <div class="reservation-card">
                    <div class="reservation-header">
                        <div class="reservation-title">예약 #${r.id}</div>
                        <span class="reservation-status status-${r.status}">${
                            r.status === 'confirmed' ? '확정' : '진행중'
                        }</span>
                    </div>
                    <div class="reservation-details">
                        <p>📅 ${formatDateTime(r.period.lower)} ~ ${formatTime(r.period.upper)}</p>
                        <p>👤 ${r.reserver_name}</p>
                    </div>
                    ${canCancel ? `
                        <div class="reservation-actions">
                            <button class="btn-danger" onclick="cancelReservation(${r.id})">취소</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
    
    section.classList.remove('hidden');
}

async function cancelReservation(id) {
    if (!state.auth) return;
    
    if (!confirm('정말 취소하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/reservations/${id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: state.auth.phone,
                password: state.auth.password
            })
        });
        
        if (response.ok) {
            showToast('예약이 취소되었습니다', 'success');
            loadMyReservations();
        } else {
            const data = await response.json();
            showToast(data.message || '취소 실패', 'error');
        }
    } catch (error) {
        showToast('취소 중 오류 발생', 'error');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('searchDate').value = today;
    
    // Load auth from localStorage
    const savedAuth = localStorage.getItem('auth');
    if (savedAuth) {
        state.auth = JSON.parse(savedAuth);
    }
    updateAuthUI();
    
    // Event listeners
    document.getElementById('searchBtn').addEventListener('click', searchRooms);
    document.getElementById('generateSlotsBtn').addEventListener('click', generateSlots);
    document.getElementById('confirmForm').addEventListener('submit', confirmReservation);
    document.getElementById('loginForm').addEventListener('submit', login);
    
    // Modal close
    document.querySelector('.close').addEventListener('click', hideLoginModal);
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('loginModal')) {
            hideLoginModal();
        }
    });
});