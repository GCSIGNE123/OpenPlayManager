import PickleballOpenPlay from "./PickleballOpenPlay.jsx";
import { ActiveVenueProvider } from "./context/ActiveVenueContext.jsx";

export default function App() {
  return (
    <ActiveVenueProvider>
      <PickleballOpenPlay />
    </ActiveVenueProvider>
  );
}
