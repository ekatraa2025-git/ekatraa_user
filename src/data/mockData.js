export const CITIES = ['Bhubaneswar, Odisha', 'Guwahati, Assam', 'Kolkata, West Bengal'];

export const EVENT_TYPES = [
    { id: 'all', name: 'All', icon: '🎉', color: '#FF7A00' },
    { id: 'wedding', name: 'Wedding (Groom/Bride)', icon: '💒', color: '#EC4899' },
    { id: 'janayu', name: 'Janayu / Thread', icon: '🕉️', color: '#8B5CF6' },
    { id: 'social', name: 'Social Gathering', icon: '🎊', color: '#10B981' },
    { id: 'birthday', name: 'Birthday', icon: '🎂', color: '#F59E0B' },
    { id: 'corporate', name: 'Corporate', icon: '💼', color: '#3B82F6' },
    { id: 'funeral', name: 'Funeral / Antyesti', icon: '🙏', color: '#6B7280' },
];

const SERVICES = [
    { id: '1', name: 'Venue', icon: '🏰', type: ['wedding', 'janayu', 'social', 'birthday', 'corporate', 'funeral'] },
    { id: '2', name: 'Catering', icon: '🍽️', type: ['wedding', 'janayu', 'social', 'birthday', 'corporate', 'funeral'] },
    { id: '3', name: 'Decor', icon: '✨', type: ['wedding', 'janayu', 'social', 'birthday', 'corporate'] },
    { id: '4', name: 'Photo/Video', icon: '📸', type: ['wedding', 'birthday', 'janayu', 'corporate'] },
    { id: '5', name: 'Music/DJ', icon: '🎵', type: ['wedding', 'birthday', 'social'] },
    { id: '6', name: 'Makeup', icon: '💄', type: ['wedding', 'janayu'] },
    { id: '7', name: 'Mehendi', icon: '🎨', type: ['wedding'] },
    { id: '8', name: 'Pandit/Priest', icon: '🕉️', type: ['wedding', 'janayu', 'funeral'] },
    { id: '9', name: 'Sound & Lights', icon: '🔊', type: ['wedding', 'social', 'corporate', 'birthday'] },
    { id: '10', name: 'Transport', icon: '🚌', type: ['wedding', 'corporate', 'funeral'] },
];
export { SERVICES };
export { SERVICES as MOCK_SERVICES };

export const VENUES = [
    // Bhubaneswar
    {
        id: 'bbsr1',
        name: 'Mayfair Lagoon',
        city: 'Bhubaneswar',
        location: 'Jayadev Vihar',
        price: '₹2,50,000',
        rating: '4.9',
        type: ['wedding', 'corporate'],
        image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1000'
    },
    {
        id: 'bbsr2',
        name: 'Swosti Premium',
        city: 'Bhubaneswar',
        location: 'Jayadev Vihar',
        price: '₹1,80,000',
        rating: '4.7',
        type: ['wedding', 'corporate', 'social'],
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=1000'
    },
    {
        id: 'bbsr3',
        name: 'Sandy\'s Tower',
        city: 'Bhubaneswar',
        location: 'XIMB Square',
        price: '₹1,20,000',
        rating: '4.5',
        type: ['birthday', 'social'],
        image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&q=80&w=1000'
    },

    // Guwahati
    {
        id: 'ghy1',
        name: 'Radisson Blu',
        city: 'Guwahati',
        location: 'Gotanagar',
        price: '₹3,00,000',
        rating: '4.8',
        type: ['wedding', 'corporate'],
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=1000'
    },
    {
        id: 'ghy2',
        name: 'Vivanta Guwahati',
        city: 'Guwahati',
        location: 'Khanapara',
        price: '₹2,80,000',
        rating: '4.9',
        type: ['wedding', 'social'],
        image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80&w=1000'
    },
    {
        id: 'ghy3',
        name: 'Kiranshree Grand',
        city: 'Guwahati',
        location: 'Azara',
        price: '₹1,50,000',
        rating: '4.4',
        type: ['birthday', 'social', 'corporate'],
        image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=1000'
    },

    // Kolkata
    {
        id: 'ccu1',
        name: 'ITC Royal Bengal',
        city: 'Kolkata',
        location: 'EM Bypass',
        price: '₹5,00,000',
        rating: '5.0',
        type: ['wedding', 'corporate'],
        image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1000'
    },
    {
        id: 'ccu2',
        name: 'Vedic Village',
        city: 'Kolkata',
        location: 'Rajarhat',
        price: '₹2,50,000',
        rating: '4.6',
        type: ['wedding', 'social', 'janayu'],
        image: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&q=80&w=1000'
    },
    {
        id: 'ccu3',
        name: 'PC Chandra Garden',
        city: 'Kolkata',
        location: 'Science City Area',
        price: '₹1,50,000',
        rating: '4.5',
        type: ['social', 'birthday', 'funeral'],
        image: 'https://images.unsplash.com/photo-1519225421980-715cb0202128?auto=format&fit=crop&q=80&w=1000'
    },
];
