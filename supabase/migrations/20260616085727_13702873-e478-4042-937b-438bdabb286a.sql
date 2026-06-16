ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS game_ref_id uuid REFERENCES public.games(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS players_game_ref_id_idx ON public.players(game_ref_id);