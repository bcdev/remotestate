export type ItemStatus = "todo" | "doing" | "done";

export interface Item {
  id: number;
  created: string;
  title: string;
  status: ItemStatus;
}

export interface State {
  items: Item[];
  selected_item_id: number | null;
}
