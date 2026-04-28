import { useClient, useState } from "../lib";

interface MyService {
  increment: () => void;
}

export default function App() {
  const client = useClient<MyService>();
  const [count, setCount] = useState("count", 0);

  const handleIncrementClicked = () => {
    void client.action("increment");
  };

  return (
    <div>
      <div>{`Counter: ${count.toString()}`}</div>
      <button onClick={handleIncrementClicked}>Increment</button>
      <button onClick={() => void setCount(count + 2)}>Add 2</button>
    </div>
  );
}
