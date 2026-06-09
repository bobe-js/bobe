export const fib = (num: number): number => {
  return num < 2 ? num : fib(num - 1) + fib(num - 2);
}