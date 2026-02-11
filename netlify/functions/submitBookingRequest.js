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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }

    try {
        // Parse request body
        const { student_id, room_id, start_time, duration } = JSON.parse(event.body);

        // Validate inputs
        if (!student_id || !room_id || !start_time || !duration) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    message: 'Missing required fields: student_id, room_id, start_time, duration',
                }),
            };
        }

        // Validate student ID format (6-7 digits)
        if (!/^[0-9]{6,7}$/.test(student_id)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    message: 'Invalid student ID format. Must be 6-7 digits.',
                }),
            };
        }

        // Validate duration (max 2 hours = 120 minutes)
        if (duration < 30 || duration > 120) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    message: 'Duration must be between 30 and 120 minutes.',
                }),
            };
        }

        // Verify room exists and is active
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('id, is_active')
            .eq('id', room_id)
            .single();

        if (roomError || !room) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    message: 'Invalid room ID',
                }),
            };
        }

        if (!room.is_active) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    message: 'This room is currently inactive',
                }),
            };
        }

        // Calculate start and end times (today only)
        const today = new Date();
        const [hours, minutes] = start_time.split(':');
        const startDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(hours), parseInt(minutes));
        const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

        // Check if start time is in the past
        if (startDateTime <= new Date()) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    message: 'Start time must be in the future',
                }),
            };
        }

        // Check for conflicts with existing approved bookings
        const { data: conflicts, error: conflictError } = await supabase
            .from('bookings')
            .select('id')
            .eq('room_id', room_id)
            .lt('start_time', endDateTime.toISOString())
            .gt('end_time', startDateTime.toISOString());

        if (conflictError) {
            throw conflictError;
        }

        if (conflicts && conflicts.length > 0) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    message: 'This room is already booked for the selected time',
                }),
            };
        }

        // Check for pending requests for the same time slot
        const { data: pendingConflicts, error: pendingError } = await supabase
            .from('booking_requests')
            .select('id')
            .eq('room_id', room_id)
            .eq('status', 'pending')
            .lt('start_time', endDateTime.toISOString())
            .gt('end_time', startDateTime.toISOString());

        if (pendingError) {
            throw pendingError;
        }

        // Insert booking request
        const { data: newRequest, error: insertError } = await supabase
            .from('booking_requests')
            .insert({
                student_id,
                room_id,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString(),
                status: 'pending',
            })
            .select()
            .single();

        if (insertError) {
            throw insertError;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Booking request submitted successfully',
                request_id: newRequest.id,
            }),
        };

    } catch (error) {
        console.error('Error in submitBookingRequest:', error);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Failed to submit booking request',
                error: error.message,
            }),
        };
    }
};
