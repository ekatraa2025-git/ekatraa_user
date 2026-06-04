-- Ekatraa User App Database Schema
-- Run this in Supabase SQL Editor to create the required tables

-- =====================================================
-- CITIES TABLE - For location dropdown
-- =====================================================
CREATE TABLE IF NOT EXISTS cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default cities
INSERT INTO cities (name, state) VALUES 
    ('Bhubaneswar', 'Odisha'),
    ('Cuttack', 'Odisha'),
    ('Puri', 'Odisha'),
    ('Kolkata', 'West Bengal'),
    ('Guwahati', 'Assam'),
    ('Bangalore', 'Karnataka'),
    ('Hyderabad', 'Telangana'),
    ('Chennai', 'Tamil Nadu')
ON CONFLICT DO NOTHING;

-- =====================================================
-- EVENT TYPES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS event_types (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default event types
INSERT INTO event_types (id, name, icon, display_order) VALUES 
    ('all', 'All', '🎉', 0),
    ('wedding', 'Wedding (Groom/Bride)', '💒', 1),
    ('janayu', 'Janayu / Thread', '🕉️', 2),
    ('social', 'Social Gathering', '🎊', 3),
    ('birthday', 'Birthday', '🎂', 4),
    ('corporate', 'Corporate', '💼', 5),
    ('funeral', 'Funeral / Antyesti', '🙏', 6)
ON CONFLICT DO NOTHING;

-- =====================================================
-- VENUES TABLE - For venue listings
-- =====================================================
CREATE TABLE IF NOT EXISTS venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    location VARCHAR(255),
    image_url TEXT,
    images TEXT[], -- Array of image URLs
    price_per_day DECIMAL(12, 2),
    capacity_min INTEGER,
    capacity_max INTEGER,
    amenities TEXT[],
    event_types TEXT[], -- Array of event type IDs
    rating DECIMAL(2, 1) DEFAULT 4.5,
    review_count INTEGER DEFAULT 0,
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for city-based queries
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_event_types ON venues USING GIN(event_types);

-- =====================================================
-- USER PROFILES TABLE - Extended user info
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    avatar_url TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ENQUIRIES TABLE - For event planning requests
-- =====================================================
CREATE TABLE IF NOT EXISTS enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_date DATE,
    role VARCHAR(50), -- 'groom', 'bride', 'host'
    guest_count INTEGER,
    preferred_venue TEXT,
    budget DECIMAL(12, 2), -- Numeric budget amount
    budget_range VARCHAR(100), -- Text description of budget
    message TEXT, -- User's enquiry message
    additional_notes TEXT,
    contact_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(255),
    city VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'contacted', 'in_progress', 'completed', 'cancelled'
    assigned_to UUID REFERENCES auth.users(id), -- Admin/manager assigned
    notes_internal TEXT, -- Internal notes for staff
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_enquiries_user ON enquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at DESC);

-- =====================================================
-- SERVICE ENQUIRIES TABLE - For specific service requests
-- =====================================================
CREATE TABLE IF NOT EXISTS service_enquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    event_type VARCHAR(50),
    event_date DATE,
    message TEXT,
    contact_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    city VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- BOOKINGS TABLE - For confirmed bookings
-- =====================================================
CREATE TABLE IF NOT EXISTS user_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    enquiry_id UUID REFERENCES enquiries(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
    event_type VARCHAR(50),
    event_date DATE NOT NULL,
    event_time TIME,
    guest_count INTEGER,
    total_amount DECIMAL(12, 2),
    advance_paid DECIMAL(12, 2),
    payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'partial', 'paid', 'refunded'
    booking_status VARCHAR(50) DEFAULT 'confirmed', -- 'confirmed', 'in_progress', 'completed', 'cancelled'
    special_requests TEXT,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_bookings_user ON user_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookings_date ON user_bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_user_bookings_status ON user_bookings(booking_status);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookings ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can read/update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Enquiries: Users can view/create their own enquiries
DROP POLICY IF EXISTS "Users can view own enquiries" ON enquiries;
CREATE POLICY "Users can view own enquiries" ON enquiries
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create enquiries" ON enquiries;
CREATE POLICY "Users can create enquiries" ON enquiries
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Service Enquiries: Users can view/create their own
DROP POLICY IF EXISTS "Users can view own service enquiries" ON service_enquiries;
CREATE POLICY "Users can view own service enquiries" ON service_enquiries
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create service enquiries" ON service_enquiries;
CREATE POLICY "Users can create service enquiries" ON service_enquiries
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- User Bookings: Users can view their own bookings
DROP POLICY IF EXISTS "Users can view own bookings" ON user_bookings;
CREATE POLICY "Users can view own bookings" ON user_bookings
    FOR SELECT USING (auth.uid() = user_id);

-- Public read access for cities, event_types, venues, vendors, services
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view cities" ON cities;
CREATE POLICY "Public can view cities" ON cities
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view event types" ON event_types;
CREATE POLICY "Public can view event types" ON event_types
    FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view venues" ON venues;
CREATE POLICY "Public can view venues" ON venues
    FOR SELECT USING (is_active = true);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_enquiries_updated_at ON enquiries;
CREATE TRIGGER update_enquiries_updated_at
    BEFORE UPDATE ON enquiries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
CREATE TRIGGER update_venues_updated_at
    BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_bookings_updated_at ON user_bookings;
CREATE TRIGGER update_user_bookings_updated_at
    BEFORE UPDATE ON user_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- BANNERS TABLE - For success stories and promotional ads
-- =====================================================
CREATE TABLE IF NOT EXISTS banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    description TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT,
    link_type VARCHAR(50) DEFAULT 'external', -- 'external', 'vendor', 'venue', 'event'
    link_id UUID, -- Reference to vendor/venue/event if internal
    banner_type VARCHAR(50) DEFAULT 'promotional', -- 'promotional', 'success_story', 'event', 'announcement'
    display_order INTEGER DEFAULT 0,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(is_active);
CREATE INDEX IF NOT EXISTS idx_banners_order ON banners(display_order);
CREATE INDEX IF NOT EXISTS idx_banners_type ON banners(banner_type);

-- RLS for banners
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active banners" ON banners;
CREATE POLICY "Public can view active banners" ON banners
    FOR SELECT USING (is_active = true AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW()));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_banners_updated_at ON banners;
CREATE TRIGGER update_banners_updated_at
    BEFORE UPDATE ON banners
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample banners
INSERT INTO banners (title, subtitle, image_url, banner_type, display_order) VALUES 
    ('Wedding Season Special', 'Book now for exclusive discounts', 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800', 'promotional', 1),
    ('Success Story: Ravi & Priya', 'A beautiful wedding organized by Ekatraa', 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=800', 'success_story', 2),
    ('Corporate Events', 'Professional event management for businesses', 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800', 'promotional', 3)
ON CONFLICT DO NOTHING;
