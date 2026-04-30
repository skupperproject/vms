import React, { useState, useEffect } from 'react';
import { Select, SelectItem } from '@carbon/react';

const OwnerGroupSelect = ({
  id = 'owner-group-select',
  labelText = 'Owner group',
  value,
  onChange,
  disabled = false,
  style,
}) => {
  const [groups, setGroups] = useState([]);
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/v1alpha1/user/groups');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setGroups(Array.isArray(data) ? data : []);
          setLoadState('ok');
        }
      } catch (err) {
        console.error('Error fetching user groups:', err);
        if (!cancelled) {
          setGroups([]);
          setLoadState('error');
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (e) => {
    onChange(e.target.value);
  };

  const selectDisabled = disabled || loadState === 'loading';

  return (
    <Select
      id={id}
      labelText={labelText}
      value={value}
      onChange={handleChange}
      disabled={selectDisabled}
      helperText={
        loadState === 'error'
          ? 'Could not load your groups. You can still choose public or leave unset.'
          : undefined
      }
      invalid={loadState === 'error'}
      invalidText={loadState === 'error' ? 'Groups request failed' : undefined}
      style={style}
    >
      <SelectItem value="" text="-- Select a group --" />
      <SelectItem value="public" text="public" />
      {groups.map((g) => (
        <SelectItem key={g.id} value={g.id} text={g.name} />
      ))}
    </Select>
  );
};

export default OwnerGroupSelect;
