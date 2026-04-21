import React, { useState, useEffect } from 'react';
import { Outlet, useParams } from 'react-router';

const BackboneContext = () => {
  const { backboneId } = useParams();
  const [backboneName, setBackboneName] = useState('');
  const [backboneOwnerGroup, setBackboneOwnerGroup] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setBackboneName('');
      setBackboneOwnerGroup('');
      try {
        const response = await fetch(`/api/v1alpha1/backbones/${backboneId}`);
        if (!response.ok || cancelled) return;
        const bb = await response.json();
        setBackboneName(bb.name);
        setBackboneOwnerGroup(bb.ownergroup);
      } catch (err) {
        console.error('Error loading backbone metadata:', err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [backboneId]);

  return (
    <Outlet
      context={{
        backboneName,
        backboneOwnerGroup,
      }}
    />
  );
};

export default BackboneContext;
