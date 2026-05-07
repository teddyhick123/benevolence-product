import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NEWSAPI_KEY = Deno.env.get('NEWSAPI_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface NewsArticle {
  title: string;
  url: string;
  source: { name: string };
  publishedAt: string;
  description: string;
  urlToImage: string;
}

interface Holding {
  id: string;
  name: string;
}

serve(async (req) => {
  try {
    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all holdings
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('id, name');

    if (holdingsError) {
      throw new Error(`Failed to fetch holdings: ${holdingsError.message}`);
    }

    if (!holdings || holdings.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No holdings found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let totalArticlesAdded = 0;

    // For each holding, fetch news
    for (const holding of holdings as Holding[]) {
      if (!holding.name) continue;

      try {
        // Fetch news from NewsAPI
        const newsUrl = new URL('https://newsapi.org/v2/everything');
        newsUrl.searchParams.set('q', holding.name);
        newsUrl.searchParams.set('language', 'en');
        newsUrl.searchParams.set('sortBy', 'publishedAt');
        newsUrl.searchParams.set('pageSize', '5');

        // Only fetch articles from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        newsUrl.searchParams.set('from', sevenDaysAgo.toISOString().split('T')[0]);

        const newsResponse = await fetch(newsUrl.toString(), {
          headers: {
            'X-Api-Key': NEWSAPI_KEY || '',
          },
        });

        if (!newsResponse.ok) {
          console.error(`NewsAPI error for ${holding.name}:`, await newsResponse.text());
          continue;
        }

        const newsData = await newsResponse.json();
        const articles: NewsArticle[] = newsData.articles || [];

        // Insert articles into database
        for (const article of articles) {
          const { error: insertError } = await supabase
            .from('news_articles')
            .upsert(
              {
                holding_id: holding.id,
                title: article.title,
                url: article.url,
                source: article.source?.name,
                published_at: article.publishedAt,
                summary: article.description,
                image_url: article.urlToImage,
                sentiment: null, // Could add sentiment analysis later
              },
              {
                onConflict: 'url,holding_id',
                ignoreDuplicates: true,
              }
            );

          if (!insertError) {
            totalArticlesAdded++;
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error fetching news for ${holding.name}:`, error);
        // Continue with next holding
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Fetched news for ${holdings.length} holdings`,
        articlesAdded: totalArticlesAdded,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-news function:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
