import React from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-6xl font-bold text-gray-800">404</h1>
      <p className="text-lg text-gray-600 mt-2">Page Not Found</p>
      <Link to="/" className="mt-4 px-6 py-2 text-white bg-orange-500 rounded-md hover:bg-orange-600">
        Go Back Home
      </Link>
    </div>
  );
};

export default NotFound;