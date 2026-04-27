import { useClient, useStateValue } from "../lib";

interface MyService {
  increment(): void;
}

export default function App() {
  const client = useClient<MyService>();
  const counter = useStateValue<number>("counter");

  const handleIncrementClicked = () => {
    void client.action("increment");
  };

  return (
    <div>
      <div>{`Counter: ${typeof counter === "number" ? counter.toString() : ""}`}</div>
      <button onClick={handleIncrementClicked}>Increment</button>
    </div>
  );
}
