import { buttonTypes } from '../constants/clientConstants';

export default function FormAction({
  handleClick,
  type = 'Button', //valid values: Button, Submit and Reset
  text,
  disabled = false,
  id,
  customClassName,
}) {
  const className =
    '!bg-[#0F4356] !text-white rounded-[6px] flex justify-center items-center w-full min-h-11 font-medium text-sm px-5 py-2.5 text-center whitespace-normal break-words border-2 ';

  return (
    <>
      {type === buttonTypes.button && (
        <button
          type={type}
          value={type}
          className={className + ' primary-button ' + customClassName}
          onClick={handleClick}
          disabled={disabled}
          id={id}
        >
          {text}
        </button>
      )}
      {type === buttonTypes.submit && (
        <button
          type={type}
          value={type}
          className={className + ' primary-button ' + customClassName}
          onSubmit={handleClick}
          disabled={disabled}
          id={id}
        >
          {text}
        </button>
      )}
      {type === buttonTypes.reset && (
        <button
          type={type}
          value={type}
          className={className + ' primary-button ' + customClassName}
          onClick={handleClick}
          disabled={disabled}
          id={id}
        >
          {text}
        </button>
      )}
      {type === buttonTypes.cancel && (
        <button
          type={type}
          value={type}
          className={className + ' secondary-button ' + customClassName}
          onClick={handleClick}
          disabled={disabled}
          id={id}
        >
          {text}
        </button>
      )}
      {type === buttonTypes.discontinue && (
        <button
          type={type}
          value={type}
          className={
            className + 'secondary-button discontinue-button ' + customClassName
          }
          onClick={handleClick}
          disabled={disabled}
          id={id}
        >
          {text}
        </button>
      )}
    </>
  );
}
