import React from 'react';
import ExploreFeed from '../components/ExploreFeed';

const Explore: React.FC = () => {
  return (
    <ExploreFeed
      title="Global Feed"
      description="Curated generations from the community"
      showHeader
    />
  );
};

export default Explore;
