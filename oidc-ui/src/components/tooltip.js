const positionClasses = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const Tooltip = ({ content, children, position = 'top' }) => {
  return (
    <div className="relative inline-flex group max-w-[370px] md:max-w-[600px]">
      {children}

      <div
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-xs text-white opacity-0 scale-95 transition duration-150 ease-out group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100 ${positionClasses[position]} `}
      >
        {content}
      </div>
    </div>
  );
};

export default Tooltip;
