import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api/client";
import { ProfileProvider, useProfile } from "./context/ProfileContext";
import { Layout } from "./components/Layout";
import { ProfileSelect } from "./pages/ProfileSelect";
import { SetupWizard } from "./pages/SetupWizard";
import { Home } from "./pages/Home";
import { Movies } from "./pages/Movies";
import { MovieDetail } from "./pages/MovieDetail";
import { Series } from "./pages/Series";
import { SeriesDetail } from "./pages/SeriesDetail";
import { EpisodeDetail } from "./pages/EpisodeDetail";
import { Photos } from "./pages/Photos";
import { Music } from "./pages/Music";
import { Games } from "./pages/Games";
import { Files } from "./pages/Files";
import { Downloads } from "./pages/Downloads";
import { Storage } from "./pages/Storage";
import { System } from "./pages/System";
import { Search } from "./pages/Search";

function Gate() {
  const { user, loading } = useProfile();

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-faint)",
        }}
      >
        Caricamento…
      </div>
    );
  }

  if (!user) return <ProfileSelect />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="film" element={<Movies />} />
        <Route path="film/:id" element={<MovieDetail />} />
        <Route path="serie" element={<Series />} />
        <Route path="serie/:id" element={<SeriesDetail />} />
        <Route path="serie/episodi/:episodeId" element={<EpisodeDetail />} />
        <Route path="foto" element={<Photos />} />
        <Route path="musica" element={<Music />} />
        <Route path="giochi" element={<Games />} />
        <Route path="file" element={<Files />} />
        <Route path="download" element={<Downloads />} />
        <Route path="storage" element={<Storage />} />
        <Route path="sistema" element={<System />} />
        <Route path="cerca" element={<Search />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function SetupGate() {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .getSetupStatus()
      .then((res) => setCompleted(res.completed))
      // Hub API irraggiungibile: non blocca sul wizard, la normale
      // gestione offline/errore di ProfileSelect prende il sopravvento.
      .catch(() => setCompleted(true));
  }, []);

  if (completed === null) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-faint)",
        }}
      >
        Caricamento…
      </div>
    );
  }

  if (!completed) {
    return <SetupWizard onFinished={() => setCompleted(true)} />;
  }

  return (
    <ProfileProvider>
      <Gate />
    </ProfileProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SetupGate />
    </BrowserRouter>
  );
}
