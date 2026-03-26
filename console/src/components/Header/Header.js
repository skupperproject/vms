import React from 'react';
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
} from '@carbon/react';
import { UserAvatar, Notification } from '@carbon/icons-react';

const AppHeader = () => {
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
          aria-label="User Avatar"
          tooltipAlignment="end"
        >
          <UserAvatar size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>
    </Header>
  );
};

export default AppHeader;

// Made with Bob
