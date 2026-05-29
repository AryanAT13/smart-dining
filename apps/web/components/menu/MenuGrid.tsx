'use client';

import { useMemo, useState } from 'react';

import type { MenuItemDto } from '@smart-dining/shared';

import { CategoryTabs } from './CategoryTabs';
import { FilterChips, type FilterKey } from './FilterChips';
import { MenuCard } from './MenuCard';

interface MenuGridProps {
  items: MenuItemDto[];
  popular: MenuItemDto[];
  onAdd: (item: MenuItemDto) => void;
}

export function MenuGrid({ items, popular, onAdd }: MenuGridProps) {
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set());

  const categories = useMemo(() => {
    const set = new Set(items.map((it) => it.category));
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (activeCategory !== 'all' && it.category !== activeCategory) return false;
      if (filters.has('veg') && !it.tags.includes('veg')) return false;
      if (filters.has('spicy') && !it.tags.includes('spicy')) return false;
      if (filters.has('bestseller') && !it.tags.includes('bestseller')) return false;
      if (filters.has('gluten-free') && it.allergens.includes('gluten')) return false;
      return true;
    });
  }, [items, activeCategory, filters]);

  const grouped = useMemo(() => {
    const groups = new Map<string, MenuItemDto[]>();
    for (const item of filteredItems) {
      const arr = groups.get(item.category) ?? [];
      arr.push(item);
      groups.set(item.category, arr);
    }
    return Array.from(groups.entries());
  }, [filteredItems]);

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <CategoryTabs categories={categories} active={activeCategory} onChange={setActiveCategory} />
      <FilterChips active={filters} onToggle={toggleFilter} />

      {activeCategory === 'all' && filters.size === 0 && popular.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Popular right now
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {popular.slice(0, 4).map((item) => (
              <MenuCard key={item.id} item={item} onAdd={onAdd} />
            ))}
          </div>
        </section>
      )}

      {grouped.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No items match those filters.
        </p>
      ) : (
        grouped.map(([category, list]) => (
          <section key={category} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {category.replaceAll('_', ' ')}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {list.map((item) => (
                <MenuCard key={item.id} item={item} onAdd={onAdd} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
