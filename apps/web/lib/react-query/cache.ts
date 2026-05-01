type EntityWithId = {
  id: string;
};

export function prependUniqueById<TItem extends EntityWithId>(
  item: TItem,
  items: TItem[] = [],
): TItem[] {
  return [item, ...items.filter((currentItem) => currentItem.id !== item.id)];
}

export function removeById<TItem extends EntityWithId>(
  id: string,
  items: TItem[] = [],
): TItem[] {
  return items.filter((item) => item.id !== id);
}

export function replaceById<TItem extends EntityWithId>(
  item: TItem,
  items?: TItem[],
): TItem[] | undefined {
  return items?.map((currentItem) =>
    currentItem.id === item.id ? item : currentItem,
  );
}
