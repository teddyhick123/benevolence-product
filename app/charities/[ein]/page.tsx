'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star, MapPin, ChevronDown } from 'lucide-react';
import CharityDetailTabs from '@/components/charities/CharityDetailTabs';
import AddToPortfolioModal from '@/components/charities/AddToPortfolioModal';

const WATCHLIST_KEY = 'charity_watchlist';
const NOTES_KEY = (ein: string) => `charity_notes_${ein}`;

type WatchItem = { ein: string; name: string };

function getWatchlist(): WatchItem[] {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); } catch { return []; }
}

function toggleWatchlist(ein: string, name: string): boolean {
  const list = getWatchlist();
  const idx = list.findIndex(w => w.ein === ein);
  if (idx >= 0) { list.splice(idx, 1); } else { list.push({ ein, name }); }
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  return idx < 0; // true = now watched
}

export default function CharityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ein = params.ein as string;

  const [charity, setCharity] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWatched, setIsWatched] = useState(false);
  const [notes, setNotes] = useState('');
  const notesSaveRef = useRef<NodeJS.Timeout | null>(null);

  const [addToPortfolioModal, setAddToPortfolioModal] = useState(false);

  useEffect(() => {
    if (ein) {
      fetchCharityDetails();
      setIsWatched(getWatchlist().some(w => w.ein === ein));
      setNotes(localStorage.getItem(NOTES_KEY(ein)) || '');
    }
  }, [ein]);

  function handleNotesChange(val: string) {
    setNotes(val);
    if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
    notesSaveRef.current = setTimeout(() => {
      localStorage.setItem(NOTES_KEY(ein), val);
    }, 400);
  }

  const fetchCharityDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/charities/${ein}`);

      if (response.ok) {
        const data = await response.json();
        setCharity(data.data);
      } else if (response.status === 404) {
        setError('Charity not found');
      } else {
        setError('Failed to load charity details');
      }
    } catch (err) {
      console.error('Error fetching charity details:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-azure mx-auto mb-4"></div>
          <p className="text-gray-600">Loading charity details...</p>
        </div>
      </div>
    );
  }

  if (error || !charity) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {error || 'Charity not found'}
          </h2>
          <Link href="/charities">
            <button className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90">
              Back to Charities
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const location = [charity.city, charity.state].filter(Boolean).join(', ');
  const rating = charity.charity_navigator_rating?.score;
  const ratingGrade = charity.charity_navigator_rating?.rating;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Back Button */}
          <Link
            href="/charities"
            className="inline-flex items-center text-azure hover:text-azure/80 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Link>

          {/* Charity Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{charity.name}</h1>
              <div className="flex items-center gap-4 text-gray-600 mb-3">
                {charity.sector && (
                  <span className="inline-block px-3 py-1 bg-azure/10 text-azure text-sm font-medium rounded">
                    {charity.sector}
                  </span>
                )}
                {location && (
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    <span className="text-sm">{location}</span>
                  </div>
                )}
                <span className="text-sm">EIN: {charity.ein}</span>
              </div>

              {/* Mission Statement */}
              {charity.mission && (
                <p className="text-lg text-gray-700 italic max-w-3xl">
                  &ldquo;{charity.mission}&rdquo;
                </p>
              )}
            </div>

            {/* Rating & Action */}
            <div className="ml-6 flex flex-col items-end gap-3">
              {rating && (
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Star className="w-6 h-6 text-yellow-500 fill-yellow-500 mr-2" />
                    <span className="text-3xl font-bold text-gray-900">{rating}</span>
                  </div>
                  {ratingGrade && (
                    <div className="text-sm text-gray-600">Grade: {ratingGrade}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">Charity Navigator</div>
                </div>
              )}

              {/* Add to Portfolio Button */}
              <div className="relative flex flex-col items-end gap-2">
                <button
                  onClick={() => setAddToPortfolioModal(true)}
                  className="px-6 py-3 bg-azure text-white font-medium rounded-lg hover:bg-azure/90 transition-colors flex items-center gap-2"
                >
                  Add to Portfolio
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsWatched(toggleWatchlist(ein, charity.name))}
                  className={`text-sm px-4 py-2 rounded-lg border transition-colors ${isWatched ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                >
                  {isWatched ? 'Saved' : 'Save for Later'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CharityDetailTabs charity={charity} />
      </div>

      {/* Research Notes */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">My Research Notes</h2>
          <textarea
            rows={4}
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder="Record why you're considering this charity, concerns, questions to follow up on…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-azure resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">Saved locally in your browser — not shared with others.</p>
        </div>
      </div>

      {/* Add to Portfolio Modal */}
      <AddToPortfolioModal
        isOpen={addToPortfolioModal}
        onClose={() => setAddToPortfolioModal(false)}
        charityName={charity.name}
        charityEin={charity.ein}
        onSuccess={() => {
          // Optionally refresh data or show success message
          setAddToPortfolioModal(false);
        }}
      />
    </div>
  );
}
