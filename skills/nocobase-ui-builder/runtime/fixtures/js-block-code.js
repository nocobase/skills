function Banner() {
  return <div className="banner">Hello {ctx.record?.nickname}</div>;
}

ctx.render(<Banner />);
