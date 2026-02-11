const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }

    try {
        // Get today's date range (8 AM to 6 PM)
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0, 0);

        // Get all rooms
        const { data: rooms, error: roomsError } = await supabase
            .from('rooms')
            .select('id, name')
            .eq('is_active', true)
            .order('id');

        if (roomsError) throw roomsError;

        // Get all bookings for today
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('room_id, student_id, start_time, end_time')
            .gte('end_time', todayStart.toISOString())
            .lte('start_time', todayEnd.toISOString())
            .order('start_time');

        if (bookingsError) throw bookingsError;

        // Group bookings by room
        const bookingsByRoom = {};
        bookings.forEach(booking => {
            if (!bookingsByRoom[booking.room_id]) {
                bookingsByRoom[booking.room_id] = [];
            }
            bookingsByRoom[booking.room_id].push({
                student_id: booking.student_id,
                start_time: booking.start_time,
                end_time: booking.end_time,
            });
        });

        // Combine rooms with their bookings
        const roomSchedules = rooms.map(room => ({
            id: room.id,
            name: room.name,
            bookings: bookingsByRoom[room.id] || [],
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                date: now.toISOString().split('T')[0],
                rooms: roomSchedules,
            }),
        };

    } catch (error) {
        console.error('Error in getRoomSchedules:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Failed to fetch room schedules',
                error: error.message,
            }),
        };
    }
};