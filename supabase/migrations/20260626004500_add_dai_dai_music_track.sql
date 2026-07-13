INSERT INTO public.music_tracks (title, url, sort_order, is_active)
SELECT
  'Shakira, Burna Boy - Dai Dai',
  'https://youtu.be/t761jweytGg?si=AS36AfAZBLQyhLG5',
  COALESCE((SELECT MAX(sort_order) + 1 FROM public.music_tracks), 0),
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.music_tracks
  WHERE url = 'https://youtu.be/t761jweytGg?si=AS36AfAZBLQyhLG5'
     OR url LIKE '%t761jweytGg%'
);
