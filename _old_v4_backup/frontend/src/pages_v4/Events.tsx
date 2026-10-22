import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Landmark, Plus, MapPin, Calendar } from 'lucide-react';

interface Event {
  id: string;
  name: string;
  location: string;
  startDate: string;
  status: string;
}

const Events = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/events', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setEvents(res.data.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchEvents();
  }, [token]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
          <Landmark className="mr-2" /> Events & Pop-ups
        </h1>
        <button className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center">
          <Plus size={18} className="mr-1" /> New Event
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((e) => (
          <div key={e.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <h2 className="font-bold text-lg text-gray-900">{e.name}</h2>
              <span className={`px-2 py-1 text-[10px] font-black uppercase rounded ${e.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {e.status}
              </span>
            </div>
            <div className="space-y-2 mb-6">
              <div className="flex items-center text-sm text-gray-500">
                <MapPin size={16} className="mr-2" /> {e.location}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Calendar size={16} className="mr-2" /> {new Date(e.startDate).toLocaleDateString()}
              </div>
            </div>
            <button className="w-full py-2 text-purple-600 border border-purple-200 rounded-lg font-bold text-sm hover:bg-purple-50">
              Manage Inventory
            </button>
          </div>
        ))}
        {events.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 italic">No events scheduled.</div>
        )}
      </div>
    </div>
  );
};

export default Events;
