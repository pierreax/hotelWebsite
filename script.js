document.getElementById('searchForm').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const city = document.getElementById('city').value;
    const checkInDate = document.getElementById('checkInDate').value;
    const checkOutDate = document.getElementById('checkOutDate').value;
    const adults = document.getElementById('adults').value;

    const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
    const getHotelsByCityUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCity?code=Ju_HZuehLiugOF1CymMhAWdIF9SmnEWJq6o9djCRHLLFAzFudBcnQw%3D%3D';
    const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';

    let accessToken; 

    const fetchHotelOffers = (validHotelIds) => {
        // Limit to 10 hotel IDs
        const limitedHotelIds = validHotelIds.slice(0, 10);
        const url = `${getHotelOffersUrl}&hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDate}&roomQuantity=1&paymentPolicy=NONE&bestRateOnly=true`;
        console.log('Fetching hotel offers with URL:', url);

        return fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
        .then(response => response.text())
        .then(text => {
            try {
                const response = JSON.parse(text);
                // Log the entire response for debugging
                console.log('Hotel offers response:', response);

                if (response.errors) {
                    const errorDetails = response.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                    throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                }
                return response;
            } catch (err) {
                throw new Error(`Failed to fetch hotel offers: ${text}`);
            }
        });
    };

    fetch(getAccessTokenUrl)
    .then(response => response.json())
    .then(tokenData => {
        if (!tokenData.access_token) {
            throw new Error('Access token not found in response');
        }
        accessToken = tokenData.access_token;
        console.log('Access Token:', accessToken);

        return fetch(`${getHotelsByCityUrl}&cityCode=${city}&radius=5&radiusUnit=KM&hotelSource=ALL`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
    })
    .then(response => response.json())
    .then(hotelsData => {
        if (!hotelsData.data || hotelsData.data.length === 0) {
            throw new Error('No hotels found');
        }

        let hotelIds = hotelsData.data.map(hotel => hotel.hotelId);
        console.log('Hotel IDs:', hotelIds);

        return fetchHotelOffers(hotelIds)
            .catch(error => {
                console.error('Error:', error.message);

                let invalidHotelIds = [];
                try {
                    const errorMessage = error.message.split(' - ')[1];
                    const errorData = JSON.parse(errorMessage);
                    invalidHotelIds = errorData.map(err => {
                        const param = err.source.parameter;
                        return param.substring(param.indexOf('=') + 1);
                    });
                    console.log('Invalid Hotel IDs:', invalidHotelIds);
                } catch (parseError) {
                    console.error('Failed to parse error response:', parseError.message);
                }

                hotelIds = hotelIds.filter(id => !invalidHotelIds.includes(id));
                if (hotelIds.length > 0) {
                    return fetchHotelOffers(hotelIds);
                } else {
                    throw new Error('No valid hotels found after filtering');
                }
            });
    })
    .then(data => {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '';

        // Log the entire data response for debugging
        console.log('Offers data:', data);

        if (data.data && data.data.length > 0) {
            data.data.forEach(offer => {
                const hotelDiv = document.createElement('div');
                hotelDiv.className = 'hotel';

                const name = document.createElement('h2');
                name.textContent = offer.hotel.name;
                hotelDiv.appendChild(name);

                const address = document.createElement('p');
                // Check if address and lines are defined before accessing
                if (offer.hotel.address && offer.hotel.address.lines) {
                    address.textContent = offer.hotel.address.lines.join(', ');
                } else {
                    address.textContent = 'Address not available';
                }
                hotelDiv.appendChild(address);

                const price = document.createElement('p');
                price.textContent = `Price: ${offer.offers[0].price.total} ${offer.offers[0].price.currency}`;
                hotelDiv.appendChild(price);

                resultsDiv.appendChild(hotelDiv);
            });
        } else {
            resultsDiv.textContent = 'No results found';
        }
    })
    .catch(error => {
        console.error('Error:', error.message);
        document.getElementById('results').textContent = `An error occurred: ${error.message}. Please try again.`;
    });
});
