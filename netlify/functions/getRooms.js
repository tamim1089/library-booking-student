const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '',
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }

    try {
        const now = new Date().toISOString();

        // Get all rooms
        const { data: rooms, error: roomsError } = await supabase
            .from('rooms')
            .select('id, name, access_group, is_active')
            .eq('is_active', true)
            .order('id');

        if (roomsError) {
            throw roomsError;
        }

        // Get current active bookings (not expired)
        const { data: activeBookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('room_id, start_time, end_time')
            .gte('end_time', now)
            .lte('start_time', now);

        if (bookingsError) {
            throw bookingsError;
        }

        // Create a set of occupied room IDs
        const occupiedRoomIds = new Set(activeBookings.map(b => b.room_id));

        // Map rooms with availability status
        const roomsWithStatus = rooms.map(room => ({
            id: room.id,
            name: room.name,
            is_available: !occupiedRoomIds.has(room.id),
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(roomsWithStatus),
        };

    } catch (error) {
        console.error('Error in getRooms:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Failed to fetch rooms',
                error: error.message,
            }),
        };
    }
};