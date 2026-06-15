import { useRemoteStateClient, useRemoteState } from "remotestate";
import "./App.css";

function App() {
  const client = useRemoteStateClient();
  const [count, setCount] = useRemoteState("count", 0);

  return (
    <>
      <section id="center">
        <div>
          <h1>RemoteState App Demo</h1>
        </div>

        <div>
          <p>{`Count is ${count ?? "..."}`}</p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="counter"
            onClick={() => void client.action("increment")}
          >
            Increment
          </button>

          <button
            type="button"
            className="counter"
            onClick={() => void setCount((prev) => (prev ?? 0) + 2)}
          >
            Add 2
          </button>
        </div>
      </section>
    </>
  );
}

export default App;
