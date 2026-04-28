import React, { useCallback, useState, useEffect } from 'react';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  OverflowMenu,
  OverflowMenuItem,
} from '@carbon/react';
import { UserAvatar, Notification } from '@carbon/icons-react';

const AppHeader = () => {
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    fetchDisplayName();
  }, []);

  const fetchDisplayName = async () => {
    try {
      const response = await fetch('/api/v1alpha1/user/profile');
      const data = await response.json();
      setDisplayName(data.name);
    } catch (error) {
      console.error('Error fetching display name:', error);
    }
  };

  const handleLogout = useCallback(() => {
    window.location.assign('/logout');
  }, []);

  return (
    <Header aria-label="SkupperVMS">
      <HeaderName href="/" prefix="">
        SkupperVMS
      </HeaderName>
      <HeaderGlobalBar>
        <HeaderGlobalAction
          aria-label="Notifications"
          tooltipAlignment="end"
        >
          <Notification size={20} />
        </HeaderGlobalAction>
        <HeaderGlobalAction
          aria-label="User Menu"
          tooltipAlignment="end"
        >
          <OverflowMenu renderIcon={() => <UserAvatar size={20} />} flipped>
            <OverflowMenuItem style={{ color: 'black' }} itemText={displayName} disabled />
            <OverflowMenuItem
              itemText="Logout"
              onClick={handleLogout}
            />
          </OverflowMenu>
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  );
};

export default AppHeader;

// Made with Bob
