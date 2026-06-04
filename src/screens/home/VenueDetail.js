import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { useTheme } from '../../context/ThemeContext';
import BottomTabBar from '../../components/BottomTabBar';

const { width } = Dimensions.get('window');

export default function VenueDetail({ route, navigation }) {
    const { venue } = route.params;
    const { theme } = useTheme();

    // Dynamic styles based on theme
    const containerStyle = { flex: 1, backgroundColor: theme.background };
    const textStyle = { color: theme.text };
    const subTextStyle = { color: theme.textLight };
    const cardStyle = { backgroundColor: theme.inputBackground };

    return (
        <SafeAreaView style={containerStyle} edges={['top']}>
            <View style={[styles.detailHeader, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                    <Text style={{ fontSize: 24 }}>⬅️</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, textStyle]}>Venue Details</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Menu')} style={styles.iconBtn}>
                    <Text style={{ fontSize: 28, color: theme.text }}>☰</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Image source={{ uri: venue.image }} style={styles.image} />
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={[styles.name, textStyle]}>{venue.name}</Text>
                        <View style={styles.ratingBadge}>
                            <Text style={styles.ratingText}>★ {venue.rating}</Text>
                        </View>
                    </View>
                    <Text style={[styles.location, subTextStyle]}>{venue.location}</Text>
                    <Text style={[styles.price, { color: theme.primary }]}>{venue.price}</Text>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    <Text style={[styles.sectionTitle, textStyle]}>About this Venue</Text>
                    <Text style={[styles.description, textStyle]}>
                        Experience luxury and elegance at {venue.name}. Perfect for weddings, corporate events, and social gatherings.
                        Offering top-tier amenities, spacious halls, and exquisite catering options to make your event memorable.
                    </Text>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    <Text style={[styles.sectionTitle, textStyle]}>Amenities</Text>
                    <View style={styles.amenitiesContainer}>
                        {['AC Halls', 'Parking', 'Catering', 'Decor'].map((amenity, index) => (
                            <View key={index} style={[styles.amenityChip, { backgroundColor: theme.inputBackground }]}>
                                <Text style={[styles.amenityText, textStyle]}>{amenity}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
                <Button title="Book Now" onPress={() => alert('Booking feature coming soon!')} />
            </View>
            <BottomTabBar navigation={navigation} activeRoute="Home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        paddingBottom: 100,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    iconBtn: {
        padding: 5,
    },
    image: {
        width: width,
        height: 250,
    },
    content: {
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        flex: 1,
    },
    ratingBadge: {
        backgroundColor: '#4CAF50', // Success color usually stays same
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    ratingText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    location: {
        fontSize: 16,
        marginBottom: 8,
    },
    price: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    divider: {
        height: 1,
        marginVertical: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
    },
    amenitiesContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    amenityChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 10,
        marginBottom: 10,
    },
    amenityText: {},
    footer: {
        padding: 20,
        borderTopWidth: 1,
    },
});
