function GameCard(){
  const title = "테스트 게임"
  const price = 21800

  return (
    <div className="card">
      <img src="20260727_144241.jpg" alt={title} />
      <h3>{title}</h3>
      <p>{price}원</p>
    </div>
  )
}

export default GameCard