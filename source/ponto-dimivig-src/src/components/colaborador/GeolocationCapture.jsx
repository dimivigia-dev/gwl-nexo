import React, { useState, useEffect } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

const GeolocationCapture = () => {
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ('geolocation' in navigator) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setLocation(loc);
          
          // Get address from coordinates (using OpenStreetMap Nominatim)
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}`
            );
            const data = await response.json();
            setAddress(data.display_name || 'Endereço não disponível');
          } catch (error) {
            setAddress('Não foi possível obter o endereço');
          }
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
    }
  }, []);

  return (
    <div className="mt-6 p-4 bg-[#1a1a1a] rounded-xl border border-gray-700">
      <div className="flex items-start gap-3">
        <MapPin className="w-5 h-5 text-[#ff8c00] flex-shrink-0 mt-1" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white mb-1">Sua Localização</p>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Obtendo localização...</span>
            </div>
          ) : location ? (
            <>
              <p className="text-xs text-gray-400 mb-1">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
              <p className="text-xs text-gray-300">{address}</p>
            </>
          ) : (
            <p className="text-xs text-gray-400">Localização não disponível</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeolocationCapture;