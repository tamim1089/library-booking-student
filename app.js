// Configuration
const CONFIG = {
    API_BASE_URL: '/.netlify/functions',
    SPLASH_DURATION: 3000, // 3 seconds
    REFRESH_INTERVAL: 15000, // 15 seconds
    REQUEST_TIMEOUT: 10000, // 10 seconds
};

// State
let rooms = [];
let refreshInterval = null;

// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const mainApp = document.getElementById('main-app');
const timelineContainer = document.getElementById('timeline-container');
const timelineDate = document.getElementById('timeline-date');
const roomList = document.getElementById('room-list');
const roomSelect = document.getElementById('room-select');
const bookingForm = document.getElementById('booking-form');
const submitBtn = document.getElementById('submit-btn');
const refreshBtn = document.getElementById('refresh-btn');
const toast = document.getElementById('toast');
const lastUpdatedEl = document.getElementById('last-updated');

// Initialize App
async function initApp() {
    // Show splash screen for 3 seconds
    setTimeout(() => {
        splashScreen.classList.add('fade-out');
        setTimeout(() => {
            splashScreen.style.display = 'none';
            mainApp.classList.remove('hidden');
            loadTimeline();
            loadRooms();
            startAutoRefresh();
        }, 500);
    }, CONFIG.SPLASH_DURATION);

    // Set minimum start time to current time
    setMinimumStartTime();
    
    // Event listeners
    bookingForm.addEventListener('submit', handleBookingSubmit);
    refreshBtn.addEventListener('click', () => {
        loadTimeline();
        loadRooms(true);
    });
    
    // Format student ID input
    document.getElementById('student-id').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 7);
    });
}

// Set minimum start time to current time
function setMinimumStartTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('start-time').min = `${hours}:${minutes}`;
}

// Load rooms from API
async function loadRooms(isManualRefresh = false) {
    try {
        if (isManualRefresh) {
            refreshBtn.style.animation = 'spin 1s linear';
        }

        const response = await fetchWithTimeout(`${CONFIG.API_BASE_URL}/getRooms`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch rooms');
        }

        rooms = await response.json();
        renderRooms();
        updateRoomSelect();
        updateLastUpdated();

        if (isManualRefresh) {
            showToast('Room status updated', 'success');
        }
    } catch (error) {
        console.error('Error loading rooms:', error);
        roomList.innerHTML = '<div class="error-message">Unable to load rooms. Please try again.</div>';
        showToast('Failed to load rooms', 'error');
    } finally {
        if (isManualRefresh) {
            setTimeout(() => {
                refreshBtn.style.animation = '';
            }, 1000);
        }
    }
}

// Render rooms in the list
function renderRooms() {
    if (!rooms || rooms.length === 0) {
        roomList.innerHTML = '<div class="loading-message">No rooms available</div>';
        return;
    }

    roomList.innerHTML = rooms.map(room => `
        <div class="room-item">
            <div class="room-status-indicator ${room.is_available ? 'available' : 'taken'}"></div>
            <div class="room-info">
                <div class="room-name">${escapeHtml(room.name)}</div>
            </div>
            <div class="room-status-text ${room.is_available ? 'available' : 'taken'}">
                ${room.is_available ? 'Available' : 'Taken'}
            </div>
        </div>
    `).join('');
}

// Update room select dropdown
function updateRoomSelect() {
    const availableRooms = rooms.filter(room => room.is_available);
    
    roomSelect.innerHTML = '<option value="">Choose an available room...</option>' +
        availableRooms.map(room => `
            <option value="${room.id}">${escapeHtml(room.name)}</option>
        `).join('');

    if (availableRooms.length === 0) {
        roomSelect.innerHTML = '<option value="">No rooms available</option>';
        roomSelect.disabled = true;
    } else {
        roomSelect.disabled = false;
    }
}

// Update last updated timestamp
function updateLastUpdated() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    lastUpdatedEl.textContent = `Last updated: ${timeString}`;
}

// Handle booking form submission
async function handleBookingSubmit(e) {
    e.preventDefault();

    const formData = new FormData(bookingForm);
    const studentId = formData.get('student-id').trim();
    const roomId = formData.get('room');
    const startTime = formData.get('start-time');
    const duration = formData.get('duration');

    // Validation
    if (!validateStudentId(studentId)) {
        showToast('Please enter a valid 6-digit student ID', 'error');
        return;
    }

    if (!roomId) {
        showToast('Please select a room', 'error');
        return;
    }

    if (!startTime) {
        showToast('Please select a start time', 'error');
        return;
    }

    if (!duration) {
        showToast('Please select a duration', 'error');
        return;
    }

    // Check if start time is in the future
    if (!isStartTimeValid(startTime)) {
        showToast('Start time must be in the future', 'error');
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending request...';

    try {
        const response = await fetchWithTimeout(`${CONFIG.API_BASE_URL}/submitBookingRequest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                student_id: studentId,
                room_id: parseInt(roomId),
                start_time: startTime,
                duration: parseInt(duration),
            }),
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Request sent to librarians for approval!', 'success');
            bookingForm.reset();
            loadRooms(); // Refresh room list
        } else {
            showToast(data.message || 'Failed to submit request', 'error');
        }
    } catch (error) {
        console.error('Error submitting booking:', error);
        showToast('Unable to submit request. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Request Room';
    }
}

// Validate student ID format
function validateStudentId(id) {
    return /^[0-9]{6,7}$/.test(id);
}

// Check if start time is valid (in the future)
function isStartTimeValid(timeString) {
    const now = new Date();
    const [hours, minutes] = timeString.split(':').map(Number);
    const selectedTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    return selectedTime > now;
}

// Show toast notification
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    // Force reflow to restart animation
    void toast.offsetWidth;
    
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}

// Fetch with timeout
function fetchWithTimeout(url, options = {}) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), CONFIG.REQUEST_TIMEOUT)
        )
    ]);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start auto-refresh
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadRooms();
    }, CONFIG.REFRESH_INTERVAL);
}

// Stop auto-refresh (cleanup)
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', stopAutoRefresh);

// Load timeline
async function loadTimeline() {
    try {
        const response = await fetchWithTimeout(`${CONFIG.API_BASE_URL}/getRoomSchedules`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch schedule');
        }

        const data = await response.json();
        renderTimeline(data);
    } catch (error) {
        console.error('Error loading timeline:', error);
        timelineContainer.innerHTML = '<div class="error-message">Unable to load schedule</div>';
    }
}

// Render timeline
function renderTimeline(data) {
    const today = new Date(data.date);
    timelineDate.textContent = today.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });

    if (!data.rooms || data.rooms.length === 0) {
        timelineContainer.innerHTML = '<div class="loading-message">No rooms found</div>';
        return;
    }

    const now = new Date();
    const startHour = 8; // 8 AM
    const endHour = 18; // 6 PM
    const totalHours = endHour - startHour;

    // Calculate current time position (0-100%)
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const nowPosition = ((currentHour - startHour) / totalHours) * 100;
    const showNowMarker = currentHour >= startHour && currentHour <= endHour;

    timelineContainer.innerHTML = data.rooms.map(room => {
        const bookingsHtml = room.bookings.map(booking => {
            const start = new Date(booking.start_time);
            const end = new Date(booking.end_time);
            
            const startHour = start.getHours() + start.getMinutes() / 60;
            const endHour = end.getHours() + end.getMinutes() / 60;
            
            const left = ((startHour - 8) / totalHours) * 100;
            const width = ((endHour - startHour) / totalHours) * 100;
            
            const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            
            return `
                <div class="timeline-booking" 
                     style="left: ${left}%; width: ${width}%;"
                     title="Booked
${startTime} - ${endTime}">
                    Booked
                </div>
            `;
        }).join('');

        return `
            <div class="timeline-room">
                <div class="timeline-room-header">${escapeHtml(room.name)}</div>
                <div class="timeline-bar-wrapper">
                    ${bookingsHtml}
                    ${showNowMarker ? `<div class="timeline-now-marker" style="left: ${nowPosition}%"></div>` : ''}
                </div>
                <div class="timeline-hours">
                    <span>8 AM</span>
                    <span>10 AM</span>
                    <span>12 PM</span>
                    <span>2 PM</span>
                    <span>4 PM</span>
                    <span>6 PM</span>
                </div>
            </div>
        `;
    }).join('');
}

// Service Worker Registration (for PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('Service Worker registration failed:', err);
        });
    });
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
