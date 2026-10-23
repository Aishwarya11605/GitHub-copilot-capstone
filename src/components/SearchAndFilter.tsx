type SearchAndFilterProps = {
  query: string;
  filter: "all" | "completed" | "incomplete";
  onQueryChange: (value: string) => void;
  onFilterChange: (value: "all" | "completed" | "incomplete") => void;
};

export function SearchAndFilter({
  query,
  filter,
  onQueryChange,
  onFilterChange,
}: SearchAndFilterProps) {
  return (
    <section className="search-filter" aria-label="Search and filter tasks">
      <div className="field">
        <label htmlFor="task-search">Search tasks</label>
        <input
          id="task-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="task-filter">Show tasks</label>
        <select
          id="task-filter"
          value={filter}
          onChange={(event) => onFilterChange(event.currentTarget.value as typeof filter)}
        >
          <option value="all">All tasks</option>
          <option value="completed">Completed</option>
          <option value="incomplete">Incomplete</option>
        </select>
      </div>
    </section>
  );
}
